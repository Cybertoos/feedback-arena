#!/bin/bash
# Everything the analysis prints: the pre-registered tables per model, the same with cut-off runs dropped, then the exploratory measures.
cd "$(dirname "$0")" || exit 1
G="results/impossible-glm-5.3-full results/impossible-glm-5.3-abort"
O="results/impossible-opus-5.5-full results/impossible-opus-5.5-abort"
for d in $G $O; do
  [ -f "$d/runs.jsonl" ] || { echo "missing $d/runs.jsonl: unpack the release asset at the repo root first (see README)" >&2; exit 1; }
done
for s in "" "--no-truncated"; do
  echo "===== GLM $s"; node analyze-impossible.mjs $G $s
  echo; echo "===== Opus $s"; node analyze-impossible.mjs $O $s
  echo
done
echo "===== Exploratory"; node analyze-extra.mjs $G $O
