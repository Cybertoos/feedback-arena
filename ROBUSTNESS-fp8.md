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
