// Checks src/predict.js against the chain. For each recent observation, the
// Observations contract's ObservationRecorded event carries nextOccupant: the bird
// the migration put in the observed sanctuary. The formula must give the same bird
// from the containing block's parentHash and observedEpoch + 1. A fresh epoch
// starts from the seed alone (earlier holder overrides no longer apply), so this
// tests the seed layout directly.
//
// birds.app's index is used only to find which blocks hold observations; every
// value compared comes from the chain. Blocks within 64 of the head are skipped.
//
// usage: node scripts/validate.mjs [count] [--mutate]
//   count     observations to check (default 400)
//   --mutate  shift the slot mapping by one; every row should then fail
import { occupants, seedFor, OBSERVATIONS, BIRDS } from "../src/predict.js";
import { keccak256 } from "../src/keccak.js";

const API = "https://birds-app-klkn6.ondigitalocean.app/api/v1/observations"; // birds.app's own index (unofficial; may change)
const RPC = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const args = process.argv.slice(2);
const mutate = args.includes("--mutate");
const want = Number(args.find((a) => /^\d+$/.test(a)) || 400);
const hex = (b) => "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const TOPIC = hex(keccak256(new TextEncoder().encode("ObservationRecorded(address,uint8,uint8,uint64,uint8)")));

const UA = { "user-agent": "birds-forecast (https://github.com/TheBenMeadows/birds-forecast)" };
async function rpc(method, params) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json", ...UA }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

// Blocks that hold observations, newest first, deduplicated.
const head = parseInt(await rpc("eth_blockNumber", []), 16);
const blocks = new Set();
let newest = 0; // the latest observation the index knows about, final or not
let before, pages = 0;
while (blocks.size < want && pages++ < 50) {
  const u = new URL(API);
  u.searchParams.set("limit", "100");
  if (before !== undefined) u.searchParams.set("before", String(before));
  const d = await (await fetch(u, { headers: UA })).json();
  const rows = Array.isArray(d.observations) ? d.observations : [];
  if (!rows.length) break;
  for (const r of rows) {
    if (!Number.isInteger(r.blockNumber) || !Number.isInteger(r.observedEpoch)) throw new Error("unexpected API row: " + JSON.stringify(r));
    newest = Math.max(newest, r.blockNumber);
    if (r.blockNumber <= head - 64) blocks.add(r.blockNumber);
  }
  const last = rows.at(-1).observedEpoch;
  if (before !== undefined && last >= before) throw new Error("API paging did not move backwards");
  before = last;
}

const shift = mutate ? 1 : 0;
let ok = 0, miss = 0, checked = 0;
const sanctuaries = new Set();
let lo = Infinity, hi = 0;
for (const n of [...blocks].sort((a, b) => b - a)) {
  if (checked >= want) break;
  const blk = await rpc("eth_getBlockByNumber", ["0x" + n.toString(16), false]);
  const logs = await rpc("eth_getLogs", [{ blockHash: blk.hash, address: OBSERVATIONS, topics: [TOPIC] }]);
  // A second observation in the same block would revert on the 10 s cooldown, so expect one.
  for (const lg of logs) {
    if (checked >= want) break;
    const sanctuary = parseInt(lg.topics[2], 16);
    const data = lg.data.slice(2);
    const epoch = BigInt("0x" + data.slice(0, 64));
    const nextOccupant = parseInt(data.slice(64, 128), 16);
    if (!nextOccupant) continue; // the sanctuary was left empty (birds departed)
    const seed = seedFor(blk.parentHash, epoch + 1n);
    const s = Math.min(sanctuary + shift, 10);
    const predicted = occupants(seed, [s])[s];
    checked++;
    sanctuaries.add(sanctuary);
    lo = Math.min(lo, n); hi = Math.max(hi, n);
    if (predicted === nextOccupant) ok++;
    else {
      miss++;
      if (!mutate) console.log(`miss: block ${n}, epoch ${epoch + 1n}, sanctuary ${sanctuary}: predicted ${predicted}, event says ${nextOccupant}`);
    }
  }
}
// Second check, on the live contract: the stored epochSeed must equal the seed rebuilt
// from the block of the latest migration, and the five sanctuaries must hold the
// birds the seed gives (unless a holder has moved one by hand since).
const call = (to, sig) => rpc("eth_call", [{ to, data: sig }, "latest"]);
const epochIndex = BigInt(await call(BIRDS, "0x06c106f9"));
const stored = (await call(BIRDS, "0x" + hex(keccak256(new TextEncoder().encode("epochSeed()"))).slice(2, 10))).slice(2);
const last = newest;
let seedCheck = "skipped (no recent migration found)";
if (last) {
  const lb = await rpc("eth_getBlockByNumber", ["0x" + last.toString(16), false]);
  const rebuilt = hex(seedFor(lb.parentHash, epochIndex)).slice(2);
  seedCheck = rebuilt === stored ? `epochSeed() matches the migration in block ${last}` : `epochSeed() differs (birds.app's index may not have the newest observation yet; rerun in a minute)`;
  const occ = occupants(seedFor(lb.parentHash, epochIndex));
  const states = await Promise.all([1, 2, 3, 4, 5].map((s2) => rpc("eth_call", [{ to: BIRDS, data: "0x86b0b2c0" + s2.toString(16).padStart(64, "0") }, "latest"])));
  const same = states.filter((r, i) => parseInt(r.slice(66, 130), 16) === occ[i + 1]).length;
  seedCheck += `; ${same} of 5 sanctuaries hold the seed's bird now`;
}
console.log(`live contract: ${seedCheck}`);
console.log(`${ok} of ${checked} matched${mutate ? " (mutated: slot mapping shifted by one)" : ""}; blocks ${lo}-${hi}; sanctuaries seen ${[...sanctuaries].sort().join(",")}`);
const pass = mutate ? ok === 0 && checked > 0 : miss === 0 && checked >= Math.min(want, 0.9 * want);
process.exit(pass ? 0 : 1);
