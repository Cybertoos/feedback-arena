// Runs model-written code in a fresh vm context, one input at a time, in its
// own process. No require, no fs, no network. stdin: {code, inputs, timeoutMs}.
// stdout: [{ok, value} | {ok: false, error}].

import vm from "node:vm";

let raw = "";
for await (const c of process.stdin) raw += c;
const { code, inputs, timeoutMs } = JSON.parse(raw);

const out = [];
let ctx;
try {
  ctx = vm.createContext({});
  new vm.Script(code + "\n;globalThis.__solve = typeof solve === 'function' ? solve : undefined;").runInContext(ctx, { timeout: timeoutMs });
  if (typeof ctx.__solve !== "function") throw new Error("no function named solve");
} catch (e) {
  process.stdout.write(JSON.stringify(inputs.map(() => ({ ok: false, error: "load: " + String(e?.message ?? e).slice(0, 200) }))));
  process.exit(0);
}
for (const input of inputs) {
  try {
    ctx.__in = JSON.parse(JSON.stringify(input));
    const v = new vm.Script("__solve(__in)").runInContext(ctx, { timeout: timeoutMs });
    out.push({ ok: true, value: v === undefined ? null : JSON.parse(JSON.stringify(v, (k, x) => typeof x === "bigint" ? x.toString() : x)) });
  } catch (e) {
    out.push({ ok: false, error: String(e?.message ?? e).slice(0, 200) });
  }
}
process.stdout.write(JSON.stringify(out));
