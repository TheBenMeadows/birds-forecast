"""Cost of collecting all 500 Birds observation pairs, with and without the forecast.

Starts from a wallet holding one pair per sanctuary (5 pairs), as in the blog post.

  without   Each observation redraws the layout at random. When none of the five
            birds in front of you is a pair you need, you pay for a duplicate to
            move them (nobody else is observing).
  with      Each block offers a fresh layout, known a block ahead. Only observe a
            needed pair, and only in a block whose resulting layout holds another
            needed pair (except for the last one). Counts blocks; no duplicates.

Layouts come from the contract's own family (28 multipliers x 100 offsets, seed
bytes drawn uniformly), or with --uniform from five distinct birds drawn uniformly.
Fixed seeds, so every run prints the same numbers.

usage: python3 sim/simulate.py [--runs 300] [--uniform] [--land 1.0]
"""
import argparse
import random
import statistics

COPRIMES_INV = bytes.fromhex("354F51573F454761493B3D07533133115D27291B031D1F250D13152F")
HOME_BIRDS = 30
START = [87, 67, 70, 10, 18]  # one held pair per sanctuary


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
    r = random.Random(seed)
    held, need, obs, dup = start(), 495, 0, 0
    cur = layout(r, uniform)
    while need:
        new = [s for s in range(5) if cur[s] not in held[s]]
        obs += 1
        if new:
            held[new[0]].add(cur[new[0]])
            need -= 1
        else:
            dup += 1
        cur = layout(r, uniform)
    return obs, dup


def with_forecast(seed, uniform, land):
    r = random.Random(seed)
    held, need, blocks, paid_moves = start(), 495, 0, 0
    cur = layout(r, uniform)
    while need:
        blocks += 1
        nxt = layout(r, uniform)  # what an observation landing in this block would produce
        new = [s for s in range(5) if cur[s] not in held[s]]
        if not new:
            # nothing to take: pay once to move them, but only into a block that helps
            if any(nxt[s] not in held[s] for s in range(5)) and r.random() < land:
                paid_moves += 1
                cur = nxt
            continue
        s = new[0]
        after = [k for k in range(5) if nxt[k] not in held[k] and not (k == s and nxt[k] == cur[s])]
        if (after or need == 1) and r.random() < land:
            held[s].add(cur[s])
            need -= 1
            cur = nxt
    return blocks, paid_moves


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=300)
    ap.add_argument("--uniform", action="store_true", help="uniform five-bird layouts instead of the contract's 2,800")
    ap.add_argument("--land", type=float, default=1.0, help="share of targeted sends that land in their block")
    a = ap.parse_args()
    kind = "uniform layouts" if a.uniform else "contract layouts"

    res = [without_forecast(i, a.uniform) for i in range(a.runs)]
    obs = sorted(x[0] for x in res)
    dup = sorted(x[1] for x in res)
    print(f"without forecast ({kind}, {a.runs} runs): observations median {statistics.median(obs):.0f}, "
          f"p90 {obs[int(a.runs * 0.9)]}; duplicates median {statistics.median(dup):.0f}")

    res = [with_forecast(i, a.uniform, a.land) for i in range(a.runs)]
    blocks = sorted(x[0] for x in res)
    moves = sorted(x[1] for x in res)
    med = statistics.median(blocks)
    print(f"with forecast ({kind}, {a.runs} runs, {a.land:.0%} of sends land): blocks median {med:.0f} "
          f"(~{med * 12 / 3600:.1f} h at 12 s), p90 {blocks[int(a.runs * 0.9)]}; "
          f"observations 495, paid moves median {statistics.median(moves):.0f}")


if __name__ == "__main__":
    main()
