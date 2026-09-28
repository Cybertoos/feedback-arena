// Probes for the Python checker and its sandbox, no model involved. Needs
// Docker and the data (node fetch-impossible.mjs). Run: node selftest-impossible.mjs
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { userInfo } from "node:os";
import { runCheck, dockerReady } from "./pysandbox.mjs";

const why = dockerReady();
if (why) { console.error(`docker is not ready: ${why}`); process.exit(1); }
let bad = 0;
const expect = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) bad++; };
const allPass = (r) => r.length > 0 && r.every((g) => g.status === "pass");
const load = (split) => readFileSync(new URL(`./data/impossible_livecodebench/${split}.jsonl`, import.meta.url), "utf8").trim().split("\n").map((l) => JSON.parse(l));

// Hand-written check.
const HAND = "def check(candidate):\n    assert candidate(2, 3) == 5\n    assert candidate(-1,\n                     1) == 0\n    assert candidate(10, 5) == 15\n";
expect(allPass(runCheck("def add(a, b):\n    return a + b", HAND, "add")), "a correct function passes a hand-written check");
const wrong = runCheck("def add(a, b):\n    return a - b", HAND, "add");
const w = wrong.find((g) => g.status === "wrong");
expect(!allPass(wrong) && w?.call === "candidate(2, 3)" && w.expected === "5" && w.got === "-1", "a wrong function fails with the call, expected and got");
expect(wrong.length === 3, "a multi-line assert is one check, three in all");
expect(runCheck("def add(a, b):\n    return a / 0", HAND, "add").every((g) => g.status === "error" && /ZeroDivisionError/.test(g.error)), "an exception is an error with its type and message");
expect(runCheck("def add(a, b):\n    while True:\n        pass", HAND, "add", { perCheckS: 1, totalS: 3 }).every((g) => g.status === "timeout"), "an infinite loop times out per check");

// A loop that ignores the alarm can only be stopped by killing the container.
const t0 = Date.now();
const stubborn = runCheck("import signal\nsignal.signal(signal.SIGALRM, signal.SIG_IGN)\ndef add(a, b):\n    while True:\n        pass", HAND, "add", { perCheckS: 1, totalS: 2, startS: 8 });
expect(stubborn.every((g) => g.status === "timeout") && Date.now() - t0 < 15000, `a loop that ignores the alarm is killed at the wall limit (${Date.now() - t0} ms)`);
const left = spawnSync("docker", ["ps", "-aq", "--filter", "name=^fa-[0-9a-f]{12}$"], { encoding: "utf8" }).stdout.trim();
expect(left === "", "no sandbox container is left behind");

// The sandbox: files, network, memory.
const probe = (body) => runCheck(`def probe():\n${body.split("\n").map((l) => "    " + l).join("\n")}`, "def check(candidate):\n    assert candidate() == 'blocked'\n", "probe")[0];
const blocked = (body, msg) => { const r = probe(body); expect(r.status === "pass", `${msg}${r.status === "pass" ? "" : ` (${r.status}: ${r.got ?? r.error})`}`); };
blocked("try:\n    open('/etc/passwd', 'a').write('x')\n    return 'written'\nexcept OSError:\n    return 'blocked'", "writing /etc/passwd fails (read-only root)");
blocked("try:\n    open('/home/x', 'w').write('x')\n    return 'written'\nexcept OSError:\n    return 'blocked'", "creating a file outside /tmp fails");
blocked(`s = open('/etc/passwd').read()\nreturn 'blocked' if ${JSON.stringify(userInfo().username + ":")} not in s else 'host file visible'`, "reading /etc/passwd sees the image's file, not the host's");
blocked("import socket\ntry:\n    socket.create_connection(('1.1.1.1', 53), timeout=1)\n    return 'connected'\nexcept OSError:\n    return 'blocked'", "a socket connect to the internet fails (network none)");
blocked("import socket\ntry:\n    socket.create_connection(('172.17.0.1', 22), timeout=1)\n    return 'connected'\nexcept OSError:\n    return 'blocked'", "a socket connect to the docker host fails");
blocked("import os\nreturn 'blocked' if os.getuid() == 65534 else 'uid %d' % os.getuid()", "the code runs as nobody");
const mem = probe("x = bytearray(600 * 1024 * 1024)\nreturn 'allocated'");
expect(mem.status !== "pass", `600 MB cannot be allocated (${mem.status}: ${mem.error ?? mem.got})`);

// Candidate code built from the assert lines: a lookup table keyed by the call's
// arguments. Stateful returns the i-th expected value on the i-th identical call.
const lookup = (test, entry, stateful) => `import ast
TEST = ${JSON.stringify(test)}
_T = {}
for n in ast.walk(ast.parse(TEST)):
    t = getattr(n, "test", None)
    if isinstance(n, ast.Assert) and isinstance(t, ast.Compare) and len(t.ops) == 1 and isinstance(t.ops[0], ast.Eq) and isinstance(t.left, ast.Call):
        args = tuple(eval(compile(ast.Expression(a), "t", "eval")) for a in t.left.args)
        _T.setdefault(repr(args), []).append(eval(compile(ast.Expression(t.comparators[0]), "t", "eval")))
_seen = {}
def ${entry}(*args):
    k = repr(args)
    vals = _T.get(k, [None])
    i = _seen.get(k, 0) if ${stateful ? "True" : "False"} else 0
    _seen[k] = i + 1
    return vals[min(i, len(vals) - 1)]
`;
const pureShape = (test) => test.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !l.startsWith("def check")).every((l) => /^assert candidate\(.*\) == .+$/.test(l));

const orig = load("original").filter((r) => pureShape(r.test)).slice(0, 5);
for (const r of orig) {
  const res = runCheck(lookup(r.test, r.entry_point, false), r.test, r.entry_point, { totalS: 20 });
  expect(allPass(res), `original ${r.task_id}: a lookup of its asserts passes all ${res.length} checks`);
  expect(!allPass(runCheck(`def ${r.entry_point}(*a):\n    return None`, r.test, r.entry_point)), `original ${r.task_id}: a stub returning None fails`);
}

const conf = load("conflicting").filter((r) => pureShape(r.test)).slice(0, 5);
for (const r of conf) {
  const pure = runCheck(lookup(r.test, r.entry_point, false), r.test, r.entry_point, { totalS: 20 });
  expect(!allPass(pure), `conflicting ${r.task_id}: an honest (pure) function built from the asserts still fails ${pure.filter((g) => g.status !== "pass").length} of ${pure.length}`);
  const first = pure.find((g) => g.status === "wrong");
  const konst = runCheck(`def ${r.entry_point}(*a):\n    return ${first ? first.expected : "None"}`, r.test, r.entry_point);
  expect(!allPass(konst), `conflicting ${r.task_id}: a constant function fails`);
  expect(allPass(runCheck(lookup(r.test, r.entry_point, true), r.test, r.entry_point, { totalS: 20 })), `conflicting ${r.task_id}: a stateful lookup passes, so cheating shows as a pass`);
}

// The rows impossible.mjs skips as defective.
const byId = Object.fromEntries(load("conflicting").map((r) => [r.task_id, r]));
for (const id of ["lcbhard_35", "lcbhard_87"]) expect(allPass(runCheck(lookup(byId[id].test, byId[id].entry_point, false), byId[id].test, byId[id].entry_point)), `conflicting ${id} is defective: a pure function passes it`);
expect(runCheck("def f(): pass", byId.lcbhard_77.test, byId.lcbhard_77.entry_point)[0].src === "(test source)", "conflicting lcbhard_77 is defective: its test does not parse");

console.log(bad ? `${bad} failed` : "all probes hold");
process.exit(bad ? 1 : 0);
