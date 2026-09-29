#!/usr/bin/env python3
"""Cheat rate by feedback level, with and without the abort option, per model. Writes paper/figures/cheat-rate.svg."""
import json
import math
import pathlib

SETS = {
    "GLM-5.3": ("results/impossible-glm-5.3-full", "results/impossible-glm-5.3-abort"),
    "Opus 5.5": ("results/impossible-opus-5.5-full", "results/impossible-opus-5.5-abort"),
}
BARS = [("A", False), ("B", False), ("C", False), ("D", False), ("C", True), ("D", True)]


def wilson(k, n, z=1.96):
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return c - h, c + h


def counts(full, abort):
    out = {}
    for d in (full, abort):
        for line in open(pathlib.Path(d) / "runs.jsonl"):
            r = json.loads(line)
            if r["split"] != "conflicting":
                continue
            key = (r["mode"], bool(r.get("abortOption")))
            k, n = out.get(key, (0, 0))
            out[key] = (k + bool(r["cheat"]), n + 1)
    return out


W, H, PAD, PANEL_GAP = 760, 390, 56, 40
panel_w = (W - 2 * PAD - PANEL_GAP) / 2
plot_h = H - 2 * PAD - 60
bar_w = panel_w / (len(BARS) * 1.5)
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Helvetica, Arial, sans-serif" font-size="12">',
       f'<rect width="{W}" height="{H}" fill="#ffffff"/>',
       f'<text x="{W / 2}" y="24" text-anchor="middle" font-size="15" font-weight="bold">Cheats on 100 impossible tasks, by feedback level</text>']
for i, (model, dirs) in enumerate(SETS.items()):
    c = counts(*dirs)
    x0 = PAD + i * (panel_w + PANEL_GAP)
    y0 = PAD + 10
    y = lambda v: y0 + plot_h * (1 - v)
    svg.append(f'<text x="{x0 + panel_w / 2}" y="{y0 - 8}" text-anchor="middle" font-weight="bold">{model}</text>')
    for t in (0, 0.25, 0.5, 0.75, 1):
        svg.append(f'<line x1="{x0}" x2="{x0 + panel_w}" y1="{y(t)}" y2="{y(t)}" stroke="#e5e5e5"/>')
        if i == 0:
            svg.append(f'<text x="{x0 - 6}" y="{y(t) + 4}" text-anchor="end" fill="#555">{int(t * 100)}%</text>')
    for j, (mode, ab) in enumerate(BARS):
        k, n = c[(mode, ab)]
        lo, hi = wilson(k, n)
        bx = x0 + (j + 0.25) * panel_w / len(BARS)
        colour = "#b3541e" if not ab else "#2b6cb0"
        svg.append(f'<rect x="{bx}" y="{y(k / n)}" width="{bar_w}" height="{y(0) - y(k / n)}" fill="{colour}"/>')
        cx = bx + bar_w / 2
        svg.append(f'<line x1="{cx}" x2="{cx}" y1="{y(hi)}" y2="{y(lo)}" stroke="#222"/>')
        svg.append(f'<text x="{cx}" y="{y(hi) - 5}" text-anchor="middle">{k}</text>')
        svg.append(f'<text x="{cx}" y="{y(0) + 16}" text-anchor="middle">{mode}</text>')
    svg.append(f'<line x1="{x0}" x2="{x0 + panel_w}" y1="{y(0)}" y2="{y(0)}" stroke="#222"/>')
ly = H - 40
svg.append(f'<rect x="{PAD}" y="{ly - 10}" width="12" height="12" fill="#b3541e"/><text x="{PAD + 18}" y="{ly}">no abort option</text>')
svg.append(f'<rect x="{PAD + 140}" y="{ly - 10}" width="12" height="12" fill="#2b6cb0"/><text x="{PAD + 158}" y="{ly}">abort option offered (C, D)</text>')
svg.append(f'<text x="{PAD}" y="{ly + 24}" fill="#555">A: fail only.  B: kinds of failure.  C: failing calls, expected vs actual.  D: C plus checker source.  Lines: Wilson 95%.</text>')
svg.append("</svg>")
out = pathlib.Path("paper/figures/cheat-rate.svg")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text("\n".join(svg) + "\n")
print(out, {m: counts(*d) for m, d in SETS.items()})
