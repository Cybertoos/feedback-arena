#!/usr/bin/env python3
"""Builds the public run bundle: the four analysed run directories without the task tests.

Each turn loses `feedback` and `results`, which quote the dataset's tests and expected values.
Config files keep the date of `started`, not the time. Output: release/feedback-arena-runs-v1.tar.gz
"""
import json
import pathlib
import tarfile

DIRS = ["impossible-glm-5.3-full", "impossible-glm-5.3-abort", "impossible-opus-5.5-full", "impossible-opus-5.5-abort"]
DROP = ("feedback", "results")
out_root = pathlib.Path("release/feedback-arena-runs-v1")

for d in DIRS:
    src = pathlib.Path("results") / d
    dst = out_root / "results" / d
    dst.mkdir(parents=True, exist_ok=True)
    cfg = json.loads((src / "config.json").read_text())
    cfg["started"] = cfg.get("started", "")[:10]
    if cfg.get("PROVIDER") == "anthropic":
        cfg["BASE"] = "https://api.anthropic.com"
        cfg["BASE_NOTE"] = "recorded as the unused LM Studio default; the Anthropic SDK called api.anthropic.com (Message Batches)"
    (dst / "config.json").write_text(json.dumps(cfg, indent=2) + "\n")
    n = 0
    with (dst / "runs.jsonl").open("w") as f:
        for line in (src / "runs.jsonl").open():
            r = json.loads(line)
            for t in r["turns"]:
                for k in DROP:
                    t.pop(k, None)
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
            n += 1
    print(d, n, "runs")

(out_root / "results" / "RUNS-README.md").write_text(
    "# feedback-arena run records, v1\n\n"
    "The four run directories analysed in the paper: GLM-5.3 and Claude Opus 5.5, main matrix (812 runs each) and abort matrix (200 runs each).\n\n"
    "Each run keeps its outcome, the model's replies, reasoning (GLM only), code and token usage. "
    "Each turn's `feedback` and `results` fields are removed, because they quote the Impossible-LiveCodeBench tests, which are not redistributed here. "
    "Model replies can still quote parts of a test they were shown.\n\n"
    "Unpack at the repo root (`tar xzf feedback-arena-runs-v1.tar.gz`), so the files land in `results/`, then run `./analyze-all.sh` and `python3 figure.py`.\n\n"
    "Licence: CC BY 4.0.\n")
with tarfile.open("release/feedback-arena-runs-v1.tar.gz", "w:gz") as tar:
    tar.add(out_root / "results", arcname="results")
print("release/feedback-arena-runs-v1.tar.gz")
