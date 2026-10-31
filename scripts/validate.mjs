// Checks src/predict.js against real history. For each observation at epoch e mined
// in block N, the world migrated to epoch e + 1 with blockhash(N - 1); the next
// observation (epoch e + 1) must have seen the bird the formula puts at its sanctuary.
// usage: node scripts/validate.mjs [count]   (default 400 most recent observations)
import { occupants, seedFor } from "../src/predict.js";

const API = "https://birds-app-klkn6.ondigitalocean.app/api/v1/observations"; // birds.app's own index
const RPC = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const want = Number(process.argv[2] || 400);

async function rpc(method, params) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

const rows = [];
for (let before; rows.length < want;) {
  const u = new URL(API);
  u.searchParams.set("limit", "100");
  if (before) u.searchParams.set("before", String(before));
  const d = await (await fetch(u)).json();
  if (!d.observations?.length) break;
  rows.push(...d.observations);
  before = d.observations.at(-1).observedEpoch;
}
const byEpoch = new Map(rows.map((r) => [r.observedEpoch, r]));

let ok = 0, miss = 0, skipped = 0;
for (const r of rows.slice(0, want)) {
  const next = byEpoch.get(r.observedEpoch + 1);
  if (!next) { skipped++; continue; }
  const prev = await rpc("eth_getBlockByNumber", ["0x" + (r.blockNumber - 1).toString(16), false]);
  const occ = occupants(seedFor(prev.hash, r.observedEpoch + 1));
  if (occ[next.sanctuaryId] === next.birdId) ok++;
  else {
    miss++;
    console.log(`miss: epoch ${r.observedEpoch + 1} predicted ${JSON.stringify(occ)}, observed ${next.sanctuaryId}:${next.birdId}`);
  }
}
console.log(`${ok} of ${ok + miss} matched (${skipped} with no following observation to compare)`);
process.exit(miss ? 1 : 0);
