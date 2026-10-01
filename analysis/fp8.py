#!/usr/bin/env python3
"""ROBUSTNESS-fp8.md: level D, conflicting split, GLM-5.3 at fp4 (main run) against fp8 (Z.AI).

Usage: analysis/fp8.py FP4_RUNS FP8_RUNS
FP4_RUNS is results/impossible-glm-5.3-full/runs.jsonl; FP8_RUNS is results/impossible-glm-5.3-fp8/runs.jsonl.
"""
import json
import math
import sys


def wilson(k, n, z=1.96):
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return f"{k} of {n} ({100 * p:.0f}%, 95% CI {100 * (c - h):.0f} to {100 * (c + h):.0f}%)"


def mcnemar_exact(b, c):
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    return min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n)


def cell(path):
    rs = [json.loads(l) for l in open(path)]
    return {r["task"]: r for r in rs if r["split"] == "conflicting" and r["mode"] == "D" and not r.get("abortOption")}


def report(fp4, fp8, label):
    tasks = sorted(set(fp4) & set(fp8))
    a = sum(fp4[t]["cheat"] for t in tasks)
    b8 = sum(fp8[t]["cheat"] for t in tasks)
    both = sum(fp4[t]["cheat"] and fp8[t]["cheat"] for t in tasks)
    only4 = sum(fp4[t]["cheat"] and not fp8[t]["cheat"] for t in tasks)
    only8 = sum(fp8[t]["cheat"] and not fp4[t]["cheat"] for t in tasks)
    print(f"## {label}: {len(tasks)} paired tasks")
    print(f"- fp4 cheats: {wilson(a, len(tasks))}")
    print(f"- fp8 cheats: {wilson(b8, len(tasks))}")
    print(f"- both {both}, fp4 only {only4}, fp8 only {only8}, neither {len(tasks) - both - only4 - only8}")
    print(f"- exact McNemar p = {mcnemar_exact(only4, only8):.3f}")


def main():
    fp4, fp8 = cell(sys.argv[1]), cell(sys.argv[2])
    report(fp4, fp8, "all runs")
    keep = lambda d: {t: r for t, r in d.items() if not r.get("truncated")}
    report(keep(fp4), keep(fp8), "runs with a cut-off reply dropped")
    served = {(t.get("usage") or {}).get("served_by") for r in fp8.values() for t in r["turns"]}
    cost = sum(((t.get("usage") or {}).get("estimated_cost") or 0) for r in fp8.values() for t in r["turns"])
    print(f"\nfp8 served by {sorted(x for x in served if x)}; billed ${cost:.2f}")


if __name__ == "__main__":
    main()
