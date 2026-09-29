# Settings record

Written 2026-09-29 from the run directories, their logs and the commands that started them. Nothing here changes a run record.

## Models

| | GLM-5.3 | Opus 5.5 |
|---|---|---|
| Model id | `zai-org/GLM-5.3` | `claude-opus-5-5` |
| Provider | DeepInfra, OpenAI-compatible endpoint `https://api.deepinfra.com/v1/openai` | Anthropic, Message Batches API (half price) |
| Effort | `reasoning_effort` medium | `output_config.effort` medium |
| Max output | 128,000 tokens | 128,000 tokens |
| Sampling | temperature 0.7 (fixed in `lib/chat.mjs:20`) | none sent; adaptive thinking (`thinking: {type: "adaptive"}`), the current models reject sampling parameters |
| Reasoning stored | yes (`reasoning` on each turn) | no |
| Attempts per run | 4 | 4 |
| Concurrency | `--jobs 12`, then 24 | all runs of a round in one batch |

## Run dates (UTC, from config.json `started` and the last write to runs.jsonl)

| Matrix | Directory | Runs | Started | Last write |
|---|---|---|---|---|
| GLM main | `results/impossible-glm-5.3-full` | 812 | 2026-09-28 | 2026-09-29 |
| GLM abort | `results/impossible-glm-5.3-abort` | 200 | 2026-09-29 | 2026-09-29 |
| Opus main | `results/impossible-opus-5.5-full` | 812 | 2026-09-28 | 2026-09-28 |
| Opus abort | `results/impossible-opus-5.5-abort` | 200 | 2026-09-28 | 2026-09-28 |

The GLM 32,000-token runs (`results/impossible-glm-5.3-cap32k-setaside`, started 2026-09-28) and the smoke and cost-sample directories are not analysed.

## Resumes

- GLM main was started three times. The log shows: 812 runs to do, 0 logged, 12 at a time; then 781 to do, 31 logged, 24 at a time; then 316 to do, 496 logged, 24 at a time. The first start's command line is not recorded beyond its `config.json`, which says `JOBS: 12`; the last two used the command line below.
- `config.json` is written only when the run directory has none, so `--resume` does not rewrite it. GLM main's config still says 12 jobs; the log shows 24 for the last two starts.
- Opus main and abort each ran once to completion. Their first-round requests went out in a batch before requests carried a run tag; see PLAN.md Changes, 2026-09-29. The analysed directories are the tagged sets.

## Command lines

Each run was started with the model flags

```
node impossible.mjs --provider openai-compatible --model zai-org/GLM-5.3 --base https://api.deepinfra.com/v1/openai --key-env DEEPINFRA_API_KEY --effort medium --max-tokens 128000 --out <dir> --budget <usd> ...
node impossible.mjs --provider anthropic --model claude-opus-5-5 --effort medium --max-tokens 128000 --out <dir> --budget <usd> ...
```

followed by these arguments. In each, the first value is the run directory (`--out`) and the second the budget (`--budget`, 0 for no cap):

- GLM main: `results/impossible-glm-5.3-full 0 --splits original,conflicting --modes A,B,C,D --jobs 24 --resume --stream`
- GLM abort, after main finished: `results/impossible-glm-5.3-abort 0 --splits conflicting --modes C,D --abort --jobs 24 --resume --stream`
- Opus main: `results/impossible-opus-5.5-full 0 --splits original,conflicting --modes A,B,C,D --batch --resume`
- Opus abort: `results/impossible-opus-5.5-abort 0 --splits conflicting --modes C,D --abort --batch --resume`
- Opus main, once before the line above, to recover the untagged first batch: `results/impossible-opus-5.5-full 0 --splits original,conflicting --modes A,B,C,D --batch --adopt msgbatch_017rfVzc7VoSmMnBJCvRq9QT --from results/impossible-opus-5.5-full-untagged`.

A watchdog drained the GLM runs (a `PAUSE` file in the run directory) when DeepInfra refused calls. No spending cap was set in the runner (`--budget 0`).

## Spend

Logged spend is the sum of `usage.estimated_cost` over every turn in the analysed `runs.jsonl` files. For GLM that number comes from DeepInfra: its API returns `estimated_cost` with each reply (`lib/chat.mjs`), at its own list price. For Opus the runner computes it from token counts and its own price table (`PRICES` in `lib/chat.mjs`), at the batch rate. The `spent:` line in a log covers only the last process, so for GLM main it shows $86.48 against $137.14 in the records.

| Matrix | Logged |
|---|---|
| GLM main | $137.14 |
| GLM abort | $27.64 |
| Opus main | $67.55 |
| Opus abort | $7.69 |

The DeepInfra console showed about 1.4 times the logged GLM figure. The logged figure counts only calls whose reply was kept in an analysed run. Calls in runs that were cut short when the GLM run was stopped and restarted (twice) or drained, retries of failed calls, and the set-aside 32,000-token runs are billed but not in these rows. The console figure is the one that was paid; the split between those causes was not measured. The untagged Opus batches were paid for. The main one was adopted into the main run, so its turns are in the Opus main figure; the untagged abort batch was set aside and its cost is in no row above.

The Opus `config.json` files in this repo's runs recorded `BASE` as `http://localhost:1234/v1`, the runner's LM Studio default, which the Anthropic path never reads: `lib/chat.mjs` and `lib/batch.mjs` build `new Anthropic()` with no base URL, so every Opus request went to `api.anthropic.com` through the Message Batches API. The release bundle records the real endpoint, and the runner now does too.
