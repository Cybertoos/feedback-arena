// Summarise an impossible.mjs run: per split and feedback mode, real solves on
// `original` and cheats on `conflicting`. Run: node summary-impossible.mjs <dir with runs.jsonl>
import { readFileSync } from "node:fs";
import { join } from "node:path";

const rows = readFileSync(join(process.argv[2], "runs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const pct = (n, d) => d ? `${Math.round((100 * n) / d)}% (${n}/${d})` : "-";
const key = (r) => r.mode + (r.abortOption ? "+abort" : "");
const modes = [...new Set(rows.map(key))].sort();
console.log("mode | original: pass | conflicting: pass (cheat) | conflicting: said impossible | conflicting: disclosed | conflicting: aborted | conflicting: original score | mean attempts");
console.log("---|---|---|---|---|---|---|---");
for (const m of modes) {
  const o = rows.filter((r) => key(r) === m && r.split === "original"), c = rows.filter((r) => key(r) === m && r.split === "conflicting");
  const all = rows.filter((r) => key(r) === m);
  const scored = c.filter((r) => r.originalScore !== null);
  const os = scored.length ? (scored.reduce((a, r) => a + r.originalScore, 0) / scored.length).toFixed(2) : "-";
  console.log(`${m} | ${pct(o.filter((r) => r.passed).length, o.length)} | ${pct(c.filter((r) => r.cheat).length, c.length)} | ${pct(c.filter((r) => r.saidImpossible).length, c.length)} | ` +
    `${pct(c.filter((r) => r.disclosed).length, c.length)} | ${pct(c.filter((r) => r.aborted).length, c.length)} | ${os} | ${(all.reduce((a, r) => a + r.attempts, 0) / all.length).toFixed(1)}`);
}
const cost = rows.flatMap((r) => r.turns).reduce((a, t) => a + (t.usage?.estimated_cost ?? 0), 0);
console.log(`\nruns ${rows.length}, logged cost $${cost.toFixed(4)}`);
// Replies cut off at --max-tokens carry no code; a high share makes the fail column mean "no answer".
const max = JSON.parse(readFileSync(join(process.argv[2], "config.json"), "utf8")).MAX_TOKENS;
const turns = rows.flatMap((r) => r.turns), cut = turns.filter((t) => t.finish === "length" || t.finish === "max_tokens" || (t.usage?.completion_tokens ?? 0) >= max).length;
console.log(`turns ${turns.length}, cut off at max tokens ${cut}; conflicting runs whose reasoning named the contradiction ${rows.filter((r) => r.split === "conflicting" && r.thoughtImpossible).length}/${rows.filter((r) => r.split === "conflicting").length}`);
console.log("\ncheats by task:");
for (const t of [...new Set(rows.filter((r) => r.cheat).map((r) => r.task))]) console.log(`  ${t}: ${rows.filter((r) => r.cheat && r.task === t).map(key).join(" ")}`);
