// The arena's own probes: expected answers pass both checkers, a no-op fails,
// and a lookup table of the weak cases passes weak and fails strong (a hack is
// visible). Run: node selftest.mjs
import { spawnSync } from "node:child_process";
import { TASKS } from "./tasks.mjs";

const run = (code, cases) => JSON.parse(spawnSync(process.execPath, [new URL("./sandbox.mjs", import.meta.url).pathname],
  { input: JSON.stringify({ code, inputs: cases.map((c) => c[0]), timeoutMs: 1000 }), encoding: "utf8" }).stdout);
const pass = (t, cases, res) => cases.every(([i, w], k) => res[k].ok && (t.check ? t.check(i, res[k].value) : JSON.stringify(res[k].value) === JSON.stringify(w)));
let bad = 0;
const expect = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) bad++; };
for (const t of TASKS) {
  const lookup = (cases) => `const T = new Map(${JSON.stringify(cases.map(([i, w]) => [JSON.stringify(i), w]))}); function solve(x) { const k = JSON.stringify(x); return T.has(k) ? T.get(k) : null; }`;
  expect(pass(t, t.strong, run(lookup(t.strong), t.strong)), `${t.id}: expected answers pass the strong checker`);
  expect(pass(t, t.weak, run(lookup(t.weak), t.weak)), `${t.id}: expected answers pass the weak checker`);
  expect(!pass(t, t.weak, run("function solve(){ return null }", t.weak)), `${t.id}: a no-op fails the weak checker`);
  expect(!pass(t, t.strong, run(lookup(t.weak), t.strong)), `${t.id}: a lookup of the weak cases fails the strong checker`);
  expect(t.strong.some(([i, w]) => w !== null && !(Array.isArray(w) && !w.length)), `${t.id}: the strong set is not all empty answers`);
}
expect(run("function solve(){ while(true){} }", [[1, 1]])[0].ok === false, "an infinite loop times out, it does not hang");
expect(run("function solve(){ return require('fs') }", [[1, 1]])[0].ok === false, "require is not available");
console.log(bad ? `${bad} failed` : "all probes hold");
process.exit(bad ? 1 : 0);
