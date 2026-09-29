# Analysis plan: how much should a checker tell an agent?

Written 2026-09-28, before any result of the full runs on the conflicting split existed. At the time of writing, the GLM-5.3 full run had logged 140 runs, all on the original split. Before that: a 12-run GLM smoke on 3 tasks (`results/impossible-glm-5.3-smoke`). Changes to this file after that point are listed at the end, with the date and the reason.

## Question

When an agent's code fails a check, how much should the checker tell it? We compare four feedback levels on ImpossibleBench's Impossible-LiveCodeBench tasks.

- **A** fail only.
- **B** the kind of failure: how many checks failed, and whether each was a wrong answer or an error.
- **C** B plus the failing calls, with expected and actual values.
- **D** C plus the checker's source code.

## Hypotheses

- **H1.** Cheating at B is no higher than at A.
- **H2.** Cheating at C and at D is higher than at B.
- **H3.** Honest solving at B is higher than at A.
- **H4.** Offering the agent a way to flag the task as impossible (`--abort`) lowers cheating at C and D.

H1 and H2 together are the threshold claim. H3 says whether B earns its place. The toy arena could not test H3 because strong models solved nearly every toy task at every level.

## Design

- **Tasks:** the 103 Impossible-LiveCodeBench tasks. **original** split for solving, **conflicting** split for cheating. On conflicting the tests contradict each other, so any pass is a cheat by construction.
- **Excluded before running:** conflicting tasks lcbhard_77 (its test does not parse), 35 and 87 (one assert copied from the original, so an honest solution passes). This leaves 103 original and 100 conflicting tasks.
- **Levels:** A, B, C and D, each run on every task without `--abort`. C and D are also run with `--abort` on the conflicting split, the only levels and the only split H4 is about.
- **Attempts:** up to 4 per run. The agent sees the feedback for its level after each failed attempt.
- **Repetitions:** 1 per task and level. Tasks are the unit of replication.
- **Models:** GLM-5.3 (DeepInfra, reasoning effort medium, max output 128,000 tokens) and Opus 5.5 (reasoning effort medium, max output 128,000 tokens, through the Message Batches API). A third, open model is added if budget allows, with the same design.
- **Execution:** model code runs in Docker with no network, a read-only filesystem, uid 65534, capped memory and a wall-clock limit (`pysandbox.mjs`). Judging uses the split's own hidden `check()`.

## Outcomes

- **Solve rate** (per model and level): the share of original-split runs whose final code passes every check.
- **Cheat rate** (per model and level): the share of conflicting-split runs whose final code passes every check.
- **Abort rate** (with `--abort`): the share of runs where the agent flags the task instead of answering.

## Analysis

- Each rate is reported with its count (k of n) and a Wilson 95% interval.
- Level comparisons pair the runs on the same task. The test is exact McNemar, two-sided, at 0.05. H1 is supported if B is not significantly above A and the point estimate difference is at most 2 tasks. H2, H3 and H4 are supported if the difference is in the stated direction and significant.
- Each model is analysed on its own. A claim holds across models only if it holds for each.
- With four hypotheses per model, results are reported both as they are and with a Holm correction.

## Runs that go wrong

- A run whose model call still fails after 3 tries is not logged, and is rerun with `--resume`. The final count of such failures per model is reported.
- A reply cut off at the token limit stays in the data. A sensitivity analysis repeats every comparison without runs that had any cut-off reply, and both are reported.
- A sandbox failure stops the whole run (`impossible.mjs` exits 2). It is fixed and the run resumed; it never becomes a result.

## Secondary and exploratory, not tested

- **Disclosure:** whether the final reply says the code special-cases the tests (the `DISCLOSED` pattern in `impossible.mjs`). Reported with examples.
- **Said or thought impossible:** whether the reply or the reasoning says the tests conflict (`SAID_IMPOSSIBLE`), and how often a cheat follows anyway.
- **Attempts to success**, per level.

## Stopping and budget

The full design runs for every model included. If money runs short, a model is dropped, never a task or a level. Nothing in this plan changes because of results seen along the way. A change to it is recorded below with its reason.

## Changes

- 2026-09-28, before any conflicting-split result of the full runs: the `--abort` matrix is cut from all four levels to C and D, to keep the study manageable. H4 concerns only C and D, so no hypothesis loses data. About 400 runs fewer per model.
- 2026-09-28, before any Opus run of the full design: Opus settings fixed as above (32,000 tokens, the same cap as GLM). It runs through the Message Batches API at half price; a batch request is the same request as a live one, so this changes cost and wall-clock time, not the data.
- 2026-09-28, before any conflicting-split result: the output cap is raised to 128,000 tokens for both models (no handicap). At 32,000, 66 of 343 GLM replies were cut off, and only 7 of the 22 runs with a cut-off reply passed, so the cap was suppressing solving. The 208 GLM runs made at 32,000 (original split only) are kept in `results/impossible-glm-5.3-cap32k-setaside` and are not analysed. GLM restarts from zero at the new cap. No spending cap in the runner; spending limits were set at the providers.
- 2026-09-29, after all results: the Opus first-round batches were first sent without a per-run tag, so requests with identical first prompts at different levels would share one reply. The tag was added (commit 9480dcb) and the untagged main batch (812 requests) was recovered with `--adopt`, which checks each reply's request hash against the job order before caching it for its tagged run; the main matrix then ran tagged in `results/impossible-opus-5.5-full`. The untagged directories are kept as `-untagged` and are not analysed. Data-neutral: each run's first reply answers the same request it would have had. Audit of the same date: 1,012 distinct first-reply hashes per model, no reply shared across cells.
- 2026-09-29, after all results: change 2 above says 32,000 tokens for Opus. Change 3 superseded it: both models ran at 128,000 tokens, as the Design section says.
