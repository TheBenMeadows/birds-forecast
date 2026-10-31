// The layout an observation in Birds (Jules and Mungi) will produce, computed
// before it is sent.
//
// Every successful observe() migrates the world: BirdsNFT sets
//   epochSeed = keccak256(abi.encodePacked(blockhash(N - 1), observer, epochIndex))
// for the block N it lands in, where observer is the Observations contract and
// epochIndex has already been incremented. The layout is an affine permutation of
// the 100 birds over 100 slots: seed byte 0 mod 28 picks the multiplier, byte 1
// mod 100 the offset (28 x 100 = 2,800 layouts). Sanctuary s is slot 29 + s.
// Holder actions (moving or shooing a bird by hand) can override a sanctuary
// within an epoch; a fresh epoch starts from the seed alone.
import { keccak256 } from "./keccak.js";

export const BIRDS = "0x75de5bc35248026fabcb2382cf322bc79dfd1a8c";
export const OBSERVATIONS = "0xcf24e99e8706ff84f90e92e73ad644a1e17beb45";
export const HOME_BIRDS = 30;
// Modular inverses of the contract's 28 multipliers, in the contract's order.
export const COPRIMES_INV = [0x35, 0x4f, 0x51, 0x57, 0x3f, 0x45, 0x47, 0x61, 0x49, 0x3b, 0x3d, 0x07, 0x53, 0x31,
  0x33, 0x11, 0x5d, 0x27, 0x29, 0x1b, 0x03, 0x1d, 0x1f, 0x25, 0x0d, 0x13, 0x15, 0x2f];

const bytes = (hex) => Uint8Array.from(hex.replace(/^0x/, "").match(/../g).map((x) => parseInt(x, 16)));

/** Seed of the epoch an observation starts when it lands in the block after prevBlockHash. */
export function seedFor(prevBlockHash, nextEpoch) {
  const input = new Uint8Array(60);
  input.set(bytes(prevBlockHash), 0);
  input.set(bytes(OBSERVATIONS), 32);
  input.set(bytes(BigInt(nextEpoch).toString(16).padStart(16, "0")), 52);
  return keccak256(input);
}

/** Bird in each sanctuary under a seed: { 1: birdId, ..., 5: birdId }. */
export function occupants(seed, sanctuaries = [1, 2, 3, 4, 5]) {
  const aInv = COPRIMES_INV[seed[0] % 28];
  const b = seed[1] % 100;
  return Object.fromEntries(
    sanctuaries.map((s) => [s, ((aInv * ((HOME_BIRDS + s - 1 + 100 - b) % 100)) % 100) + 1]),
  );
}

/** Layout after an observation lands in the block following prevBlockHash, at epoch currentEpoch. */
export const forecast = (prevBlockHash, currentEpoch, sanctuaries) =>
  occupants(seedFor(prevBlockHash, BigInt(currentEpoch) + 1n), sanctuaries);
