# birds-forecast

The sanctuary layout an observation in [Birds](https://birds.app) by [Jules](https://x.com/nicedayJules) and [Mungi](https://x.com/mungimungimungi) will produce, computed one block before it is included, plus the check against chain history and the simulations behind the cost figures in [the write-up](https://thebenmeadows.com/blog/birds-planner/).

Read-only: nothing here holds a key or sends a transaction. [Birds Planner](https://thebenmeadows.com/experiments/birds/) is the same forecast in a web page.

## The layout formula

Every successful `observe()` migrates the world. BirdsNFT (`0x75de5Bc35248026faBcb2382Cf322Bc79dFD1A8C`, implementation `0x7E6aF0854F86a4607C687B55375eEE5f6A516bbB`) sets

```
epochSeed = keccak256(abi.encodePacked(blockhash(block.number - 1), observer, epochIndex))
```

where `observer` is the Observations contract (`0xCF24e99e8706fF84F90e92e73aD644a1e17bEB45`) and `epochIndex` has already been incremented. The layout is an affine permutation of the 100 birds over 100 slots: seed byte 0 mod 28 picks one of 28 multipliers, byte 1 mod 100 the offset, so there are 2,800 layouts. Sanctuary `s` is slot `29 + s`.

`blockhash(N - 1)` is public once block N - 1 is produced, so the layout an observation in block N produces is known about 12 seconds ahead. A Bird holder moving a bird by hand can still change a sanctuary after the epoch starts.

## Use

Node 20 or later. No dependencies.

```js
import { forecast } from "./src/predict.js";

// latest block hash and the current epochIndex() from BirdsNFT
const next = forecast(latestBlockHash, currentEpoch); // { 1: birdId, ..., 5: birdId }
```

## Check it against the chain

```
node scripts/validate.mjs        # the 400 most recent observations
```

For each observation at epoch `e` in block `N`, it recomputes the seed from `blockhash(N - 1)` and `e + 1` and compares the predicted bird with the one the next observation actually saw. Observation history comes from birds.app's API, and block hashes from a public Ethereum node (set `RPC_URL` to use another). On 2026-10-31 it matched 399 of 399. Shifting the slot mapping by one drops it to 0.

## Simulations

```
python3 sim/simulate.py                  # contract layouts, 300 runs
python3 sim/simulate.py --uniform        # uniformly random five-bird layouts
python3 sim/simulate.py --land 0.5       # half of the block-targeted sends miss
```

Both start from one held pair per sanctuary and assume nobody else is observing. Without the forecast, a duplicate is paid for whenever no needed pair is in front of you. With it, a needed pair is only observed in a block whose resulting layout holds another needed pair. Seeds are fixed. On the contract's layouts: about 954 observations (460 duplicates) without the forecast. With it, 495 observations over a median 946 blocks (about 3.2 hours), or 1,886 blocks when half the sends miss.

Python 3.9 or later, standard library only.

## Limits

- Holder overrides (`shooBird`, moves) are not modeled. They only matter within an epoch.
- The sanctuary count is 5 today. Pass the enabled list to `forecast` if that changes.
- The contract is upgradeable, so the formula holds until its owner changes it.

Corrections and comments go to the [issues](../../issues).

MIT license.
