#!/usr/bin/env python3
"""Builds the public run bundle: the four analysed run directories without the task tests.

Each turn loses `feedback` and `results`, which quote the dataset's tests and expected values,
and gains `nudge`: whether its feedback was the "no code block" message. Each config gains
`failed_calls_not_logged`, counted from the run log, which is not released.
Config files keep the date of `started`, not the time. Output: release/feedback-arena-runs-<VERSION>.tar.gz
"""
import json
import pathlib
import tarfile

VERSION = "v1.1"
DIRS = ["impossible-glm-5.3-full", "impossible-glm-5.3-abort", "impossible-opus-5.5-full", "impossible-opus-5.5-abort"]
DROP = ("feedback", "results")
NUDGE = "No ```python code block"
out_root = pathlib.Path(f"release/feedback-arena-runs-{VERSION}")

for d in DIRS:
    src = pathlib.Path("results") / d
    dst = out_root / "results" / d
    dst.mkdir(parents=True, exist_ok=True)
    cfg = json.loads((src / "config.json").read_text())
    cfg["started"] = cfg.get("started", "")[:10]
    if cfg.get("PROVIDER") == "anthropic":
        cfg["BASE"] = "https://api.anthropic.com"
        cfg["BASE_NOTE"] = "originally recorded as the unused LM Studio default; the Anthropic SDK called api.anthropic.com (Message Batches)"
    log = pathlib.Path("results") / (d + ".log")
    cfg["failed_calls_not_logged"] = sum("not logged:" in l for l in log.open()) if log.exists() else None
    (dst / "config.json").write_text(json.dumps(cfg, indent=2) + "\n")
    n = 0
    with (dst / "runs.jsonl").open("w") as f:
        for line in (src / "runs.jsonl").open():
            r = json.loads(line)
            for t in r["turns"]:
                if "feedback" in t:
                    t["nudge"] = (t["feedback"] or "").startswith(NUDGE)
                for k in DROP:
                    t.pop(k, None)
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
            n += 1
    print(d, n, "runs, failed calls not logged:", cfg["failed_calls_not_logged"])

(out_root / "results" / "RUNS-README.md").write_text(
    f"# feedback-arena run records, {VERSION}\n\n"
    "The four run directories analysed in the paper: GLM-5.3 and Claude Opus 5.5, main matrix (812 runs each) and abort matrix (200 runs each).\n\n"
    "Each run keeps its outcome, the model's replies, reasoning (GLM only), code and token usage. "
    "Each turn's `feedback` and `results` fields are removed, because they quote the Impossible-LiveCodeBench tests, which are not redistributed here. "
    "In their place, `nudge` says whether the feedback was the \"no code block\" message rather than checker output. "
    "Model replies can still quote parts of a test they were shown.\n\n"
    "`failed_calls_not_logged` in each `config.json` is the count of model calls that still failed after 3 tries, from the run log. "
    "A turn's `ms` is wall-clock time for the call; for Opus, which ran through the Message Batches API, it is mostly time in the batch queue.\n\n"
    f"Unpack at the repo root (`tar xzf feedback-arena-runs-{VERSION}.tar.gz`), so the files land in `results/`, then run `./analyze-all.sh` and `python3 figure.py`.\n\n"
    "Licence: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).\n")


def anon(ti):
    ti.uid = ti.gid = 0
    ti.uname = ti.gname = ""
    return ti


with tarfile.open(f"release/feedback-arena-runs-{VERSION}.tar.gz", "w:gz") as tar:
    tar.add(out_root / "results", arcname="results", filter=anon)
print(f"release/feedback-arena-runs-{VERSION}.tar.gz")
