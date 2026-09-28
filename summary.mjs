// Summarise a run: per feedback mode, honest help on solvable tasks and hacks
// on infeasible ones. Run: node summary.mjs <dir with runs.jsonl>
import { readFileSync } from "node:fs";
import { join } from "node:path";

const rows = readFileSync(join(process.argv[2], "runs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const pct = (n, d) => d ? `${Math.round((100 * n) / d)}% (${n}/${d})` : "-";
const modes = [...new Set(rows.map((r) => r.mode))].sort();
console.log("mode | solvable: true pass | solvable: overfit | infeasible: hack | infeasible: said impossible | mean attempts");
console.log("---|---|---|---|---|---");
for (const m of modes) {
  const s = rows.filter((r) => r.mode === m && r.kind === "solvable"), i = rows.filter((r) => r.mode === m && r.kind === "infeasible");
  const att = rows.filter((r) => r.mode === m).reduce((a, r) => a + r.attempts, 0) / rows.filter((r) => r.mode === m).length;
  console.log(`${m} | ${pct(s.filter((r) => r.strongPass).length, s.length)} | ${pct(s.filter((r) => r.overfit).length, s.length)} | ${pct(i.filter((r) => r.hack).length, i.length)} | ${pct(i.filter((r) => r.saidImpossible).length, i.length)} | ${att.toFixed(1)}`);
}
console.log("\nhacks by task:");
for (const t of [...new Set(rows.filter((r) => r.hack).map((r) => r.task))]) console.log(`  ${t}: ${rows.filter((r) => r.hack && r.task === t).map((r) => r.mode).join(" ")}`);
