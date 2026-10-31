"""Cost of collecting all 500 Birds observation pairs, with and without the forecast.

Starts from a wallet holding one pair per sanctuary (5 pairs) and assumes nobody
else is observing.

  without   Each observation redraws the layout. When none of the five birds in
            front of you is a pair you need, you pay for a duplicate to move them.
  with      Each block offers a fresh layout, known a block ahead. Observe a needed
            pair only in a block whose resulting layout holds another pair still
            needed (any needed pair in front of you may be the one taken; the last
            pair needs nothing after it). When nothing needed is in front of you,
            pay one duplicate to move them, again only into a block that helps.
            Sends are block-targeted bundles: --land is the share included in their
            block; a bundle that misses is dropped and costs nothing.

The contract's 10 s observation cooldown is shorter than a 12 s block, so one
observation per block is allowed (--cooldown and --block change that).

Layouts come from the contract's own family (28 multipliers x 100 offsets, from a
uniform seed byte each, with the contract's mod bias), or with --uniform from five
distinct birds drawn uniformly. Seeds are fixed: a given CPython version prints the
same numbers every run.

usage: python3 sim/simulate.py [--runs 300] [--uniform] [--land 1.0] [--cooldown 10] [--block 12]
"""
import argparse
import math
import random
import statistics

COPRIMES_INV = bytes.fromhex("354F51573F454761493B3D07533133115D27291B031D1F250D13152F")
HOME_BIRDS = 30
START = [87, 67, 70, 10, 18]  # one held pair per sanctuary
NEED = 500 - len(START)


def layout(r, uniform):
    if uniform:
        return r.sample(range(1, 101), 5)
    a_inv = COPRIMES_INV[r.randrange(256) % 28]
    b = r.randrange(256) % 100
    return [((a_inv * ((HOME_BIRDS + s - b) % 100)) % 100) + 1 for s in range(5)]


def start():
    held = [set() for _ in range(5)]
    for s, bird in enumerate(START):
        held[s].add(bird)
    return held


def without_forecast(seed, uniform):
    """Returns (fee-paying observations, duplicates)."""
    r = random.Random(seed)
    held, need, obs = start(), NEED, 0
    cur = layout(r, uniform)
    while need:
        new = [s for s in range(5) if cur[s] not in held[s]]
        obs += 1
        if new:
            held[new[0]].add(cur[new[0]])
            need -= 1
        cur = layout(r, uniform)
    return obs, obs - NEED


def helps(held, nxt, taken=None):
    """Whether layout nxt holds a needed pair, not counting the one just taken."""
    return any(nxt[k] not in held[k] and (k, nxt[k]) != taken for k in range(5))


def with_forecast(seed, uniform, land, gap):
    """Returns (blocks elapsed, fee-paying observations, duplicates)."""
    r = random.Random(seed)
    held, need, blocks, dup, wait = start(), NEED, 0, 0, 0
    cur = layout(r, uniform)
    while need:
        blocks += 1
        nxt = layout(r, uniform)  # what an observation included in this block would produce
        if wait:
            wait -= 1
            continue
        new = [s for s in range(5) if cur[s] not in held[s]]
        if new:
            pick = next((s for s in new if need == 1 or helps(held, nxt, (s, cur[s]))), None)
            if pick is not None and r.random() < land:
                held[pick].add(cur[pick])
                need -= 1
                cur, wait = nxt, gap - 1
        elif helps(held, nxt) and r.random() < land:
            dup += 1
            cur, wait = nxt, gap - 1
    return blocks, NEED + dup, dup


def summary(values):
    values = sorted(values)
    p90 = statistics.quantiles(values, n=10)[8] if len(values) > 1 else values[0]
    return f"median {statistics.median(values):g}, p90 {p90:g}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=300)
    ap.add_argument("--uniform", action="store_true", help="uniform five-bird layouts instead of the contract's family")
    ap.add_argument("--land", type=float, default=1.0, help="share of block-targeted bundles included in their block (0 < land <= 1)")
    ap.add_argument("--cooldown", type=float, default=10, help="contract observation cooldown, seconds")
    ap.add_argument("--block", type=float, default=12, help="seconds per block")
    a = ap.parse_args()
    if a.runs < 1 or not 0 < a.land <= 1 or a.block <= 0 or a.cooldown < 0:
        ap.error("need runs >= 1, 0 < land <= 1, block > 0, cooldown >= 0")
    gap = max(1, math.ceil(a.cooldown / a.block))  # blocks between two observations
    kind = "uniform layouts" if a.uniform else "contract layouts"

    res = [without_forecast(i, a.uniform) for i in range(a.runs)]
    print(f"without forecast ({kind}, {a.runs} runs): fee-paying observations {summary(x[0] for x in res)}; "
          f"duplicates {summary(x[1] for x in res)}")

    res = [with_forecast(i, a.uniform, a.land, gap) for i in range(a.runs)]
    med = statistics.median(x[0] for x in res)
    print(f"with forecast ({kind}, {a.runs} runs, {a.land:.0%} of bundles land, one observation per {gap} block(s)): "
          f"blocks {summary(x[0] for x in res)} (median ~{med * a.block / 3600:.1f} h); "
          f"fee-paying observations {summary(x[1] for x in res)}; duplicates {summary(x[2] for x in res)}")


if __name__ == "__main__":
    main()
