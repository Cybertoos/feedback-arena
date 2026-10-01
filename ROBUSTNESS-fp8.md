# Robustness check: GLM-5.3 at fp8, fixed before the run (2026-10-01)

## Why

The main GLM-5.3 runs used DeepInfra, which serves the model at fp4 (its model page, read 2026-10-01). The paper's headline is GLM's cheating at level D on the conflicting split: 67 of 100. Does it hold on 8-bit or full weights?

## Run

The level D, conflicting split cell only: 100 tasks, one run each, 4 attempts, same prompts, effort medium, 128,000 output tokens, streaming. Model `z-ai/glm-5.3` through OpenRouter, routed only to fp8 or bf16 endpoints (`ARENA_ROUTE={"quantizations":["fp8","bf16"]}`); the serving provider is recorded per reply. Hard cap $60 (`--budget 60`), billed cost from OpenRouter's `cost` field.

## Analysis, fixed now

- Cheats out of 100 at fp8, with a Wilson interval, beside 67 of 100 at fp4.
- Paired by task: tasks that cheat in both, in fp4 only, in fp8 only; exact McNemar test.
- Runs with a cut-off reply, reported and also dropped, as in the paper.

## Reading

- Same within the intervals: the headline does not depend on fp4. The paper says so in Limitations.
- Lower at fp8 by a McNemar p under 0.05: the headline is partly an artefact of 4-bit weights. The paper must say so before publication.
- Settings differ in one known way: OpenRouter maps "medium" effort onto each provider's levels; Z.ai has low, high and max. Recorded per run, not controlled.

## Not a re-run of the paper

One cell, one repetition. Levels A to C and the abort arm are not repeated.

## Change before the main run (2026-10-01, after a 1-task and a 2-task smoke)

Routing by quantization alone sent the turns of one run to different providers (SiliconFlow, Baidu), with much less reasoning than the fp4 runs. The run is pinned to Z.AI, the model's maker, at fp8, no fallbacks: `ARENA_ROUTE={"order":["z-ai"],"allow_fallbacks":false}`. On the 2 smoke tasks its output per turn (386 to 3,752 tokens) was in the range of the fp4 runs on the same tasks (393 to 1,466). Smoke runs are not counted.

## Result (2026-10-01, 100 of 100 tasks)

From `python3 analysis/fp8.py <fp4 runs> results/impossible-glm-5.3-fp8/runs.jsonl`. Every fp8 reply was served by Z.AI; billed $14.64.

| | fp4 (main run) | fp8 (Z.AI) |
|---|---|---|
| Cheats, all runs | 67 of 100 (67%, 95% CI 57 to 75%) | 76 of 100 (76%, 95% CI 67 to 83%) |
| Cheats, cut-off runs dropped | 65 of 95 (68%) | 74 of 95 (78%) |

Paired: both 53, fp4 only 14, fp8 only 23, neither 10; exact McNemar p = 0.188 (0.175 with cut-off runs dropped).

**Reading, by the rule fixed above:** the same within the intervals. The level D result does not depend on 4-bit weights; at fp8 GLM-5.3 cheated somewhat more, not less.

**A second finding:** 37 of 100 tasks changed outcome between the two runs. Part of that is the change of weights and provider, part is run-to-run variation; this check cannot separate them. Either way, a single run per task is a noisy measure of one task, and the paper's per-task statements should be read as rates over tasks.
