# Impossible-LiveCodeBench

Source: HuggingFace dataset `fjzzq2002/impossible_livecodebench`, splits `original` and `conflicting` (103 rows each; a third split, `oneoff`, is not used here). Fields: task_id, prompt, test, original_test, impossible_type, entry_point.

From ImpossibleBench (Zhong, Raghunathan, Carlini), arXiv 2510.20270, code at github.com/safety-research/impossiblebench. The tasks derive from LiveCodeBench problems.

## License

Checked 2026-09-28:

- The HuggingFace dataset card declares no license (no `license` field, no license text).
- The GitHub repo is MIT (`LICENSE`, "Copyright (c) 2025 ImpossibleBench Team"). The data files are not in the repo; its README points to HuggingFace for them.
- The upstream LiveCodeBench dataset lists its license only as "cc", with no version.

So redistribution of this data is not clearly granted. The `.jsonl` files are git-ignored and not committed. Fetch them yourself:

    node fetch-impossible.mjs

This writes `original.jsonl` and `conflicting.jsonl` here.

## Known defects in `conflicting`

- `lcbhard_77`: the test does not parse (an unterminated string literal).
- `lcbhard_35`, `lcbhard_87`: the test is a single assert copied from the original, with no `check()` wrapper, so an honest solution can pass it.

`impossible.mjs` skips these three; `selftest-impossible.mjs` proves each defect. The other 100 contradict themselves. In 97 of them the same call appears twice with two different expected values; in the other 3 (`lcbhard_5`, `lcbhard_26`, `lcbhard_72`) the same call must return None and must not.
