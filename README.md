# birds-forecast

The sanctuary layout an observation in [Birds](https://birds.app) by [Jules](https://x.com/nicedayJules) and [Mungi](https://x.com/mungimungimungi) will produce, computed one block before it is included, plus a check against the chain and the simulations behind the cost figures in [the write-up](https://thebenmeadows.com/blog/birds-planner/). [Birds Planner](https://thebenmeadows.com/experiments/birds/) is the same forecast in a web page.

Nothing here holds a key or sends a transaction. `scripts/validate.mjs` makes read-only HTTPS requests to a public Ethereum JSON-RPC node and to birds.app's observation index.

An independent project, not affiliated with Birds, Jules or Mungi.

## The layout formula

Every successful `observe()` migrates the world. BirdsNFT (`0x75de5Bc35248026faBcb2382Cf322Bc79dFD1A8C`, implementation `0x7E6aF0854F86a4607C687B55375eEE5f6A516bbB`) sets

```
epochSeed = keccak256(abi.encodePacked(blockhash(block.number - 1), observer, epochIndex))
```

packed as 32 + 20 + 8 bytes, where `observer` is the Observations contract (`0xCF24e99e8706fF84F90e92e73aD644a1e17bEB45`) and `epochIndex`, a uint64, has already been incremented. The layout is an affine permutation of the 100 birds over 100 slots: seed byte 0 mod 28 picks one of 28 multipliers and byte 1 mod 100 the offset, giving 2,800 parameter pairs. Sanctuary `s` is slot `29 + s`.

The two byte reductions are biased, so the pairs are not equally likely. In any one sanctuary, the most likely birds turn up 1.5 times as often as the least likely ones (768 against 512 of the 65,536 byte pairs).

`blockhash(N - 1)` is public once block N - 1 is produced, so the layout an observation included in block N will produce is known up to 12 seconds ahead. The contract's 10-second observation cooldown is shorter than a block, so one observation per block is allowed, and a second one in the same block reverts.

## Use

Node 20 or later. No dependencies.

```js
import { forecast } from "./src/predict.js";

// latest block hash and BirdsNFT's epochIndex(), read at the same block
const next = forecast(latestBlockHash, currentEpoch); // { 1: birdId, ..., 5: birdId }
```

The result is the layout your observation will leave behind, which tells you whether it is worth sending. It is not the bird to pass to `observe()`: `expectedBirdId` is the bird in the sanctuary now (`getSanctuaryState`). If another observation is included first, the epoch moves on and the forecast no longer applies; `observe()` then reverts rather than minting a different pair.

## Check it against the chain

```
node scripts/validate.mjs            # the 400 most recent observations
node scripts/validate.mjs --mutate   # the same rows with the slot mapping shifted by one
```

For each observation, the contract's `ObservationRecorded` event records `nextOccupant`, the bird the migration put in the observed sanctuary. The script recomputes the seed from the containing block's `parentHash` and `observedEpoch + 1` and compares. A fresh epoch starts from the seed alone, so holder moves from the epoch before cannot interfere. It then checks the live contract: the stored `epochSeed()` must equal the seed rebuilt from the latest migration's block, and it reports how many of the five sanctuaries still hold the seed's bird.

Every compared value comes from the chain. birds.app's index (an undocumented endpoint that may change) is used only to find which blocks hold observations. Blocks within 64 of the head are skipped. Set `RPC_URL` to use another node.

On 2026-10-31: 400 of 400 matched across all five sanctuaries (blocks 26,235,918 to 26,307,101), `epochSeed()` matched, and `--mutate` gave 0 of 400.

## Simulations

```
python3 sim/simulate.py                  # contract layouts, 300 runs
python3 sim/simulate.py --uniform        # uniformly random five-bird layouts
python3 sim/simulate.py --land 0.5       # half of the block-targeted bundles miss
python3 sim/simulate.py --cooldown 30    # if the cooldown were longer than a block
```

Both strategies start from one held pair per sanctuary and assume nobody else is observing. Without the forecast, a duplicate is paid for whenever no needed pair is in front of you. With it, a needed pair is only observed in a block whose resulting layout holds another needed pair. Sends are modeled as block-targeted bundles: one that misses its block is dropped and costs nothing. A plain transaction that lands a block late would still succeed and leave an unplanned layout, which is not modeled.

Results on the contract's layouts (CPython 3.15; seeds are fixed, so a given CPython version prints the same numbers every run):

| | Fee-paying observations (median) | Duplicates (median) | Blocks (median) |
|---|---|---|---|
| Without the forecast | 954.5 | 459.5 | - |
| With it, every bundle lands | 495 | 0 | 935.5 (about 3.1 hours) |
| With it, half the bundles miss | 495 | 0 | 1,874 (about 6.2 hours) |

Uniform layouts give 939.5 observations without the forecast. The 90th percentiles are printed alongside. Python 3.9 or later, standard library only.

## Limits

- Holder overrides (`shooBird`, moves by hand) are not modeled. Within an epoch they can replace the predicted bird or leave the sanctuary empty.
- `occupants` and `forecast` return a bird for any sanctuary id you pass. Pass only enabled sanctuaries (5 today). A disabled one is always empty on chain.
- After 1,000,000 observations the birds depart for good and every sanctuary is empty. There had been 20,292 on 2026-10-31.
- Both contracts are upgradeable (`upgradesFrozen()` was false on 2026-10-31), so the formula holds until their owner changes it.

Corrections and comments go to the [issues](../../issues).

MIT license. The license covers this code, not the artists' names, contracts or work.
