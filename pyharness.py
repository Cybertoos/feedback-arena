# Runs inside the container only. stdin: {code, test, entry_point, per_check_s, total_s}.
# Execs the candidate in a fresh namespace, then runs each top-level statement
# of check(candidate) on its own. A statement holding an assert is one check;
# other statements (result = candidate(...), helper defs) are setup and only
# reported when they raise. stdout: one JSON line per event, then {"done": true}.
import ast, builtins, json, os, signal, sys, time

sys.set_int_max_str_digits(0)
req = json.loads(sys.stdin.read())
out = os.fdopen(os.dup(1), "w")
null = os.open(os.devnull, os.O_WRONLY)
os.dup2(null, 1)  # candidate prints go nowhere, not into the protocol
os.dup2(null, 2)


def emit(o):
    out.write(json.dumps(o) + "\n")
    out.flush()


class Timeout(BaseException):  # BaseException so `except Exception` in the candidate cannot swallow it
    pass


def on_alarm(*_):
    raise Timeout()


signal.signal(signal.SIGALRM, on_alarm)


def limit(s):
    signal.setitimer(signal.ITIMER_REAL, max(s, 0.001))


def clear():
    signal.setitimer(signal.ITIMER_REAL, 0)


def show(v):
    try:
        s = repr(v)
    except BaseException as e:
        if isinstance(e, Timeout):
            raise
        s = "<unrepresentable %s>" % type(e).__name__
    return s if len(s) <= 300 else s[:300] + "..."


def err(e):
    return "%s: %s" % (type(e).__name__, str(e)[:200])


test = req["test"]
try:
    tree = ast.parse(test)
except SyntaxError as e:
    emit({"load": "test", "error": err(e)})
    emit({"done": True})
    sys.exit(0)

check = [s for s in tree.body if isinstance(s, ast.FunctionDef) and s.name == "check"]
# A few rows have bare asserts with no check() wrapper; the module is the body then.
prelude = [s for s in tree.body if s not in check] if check else []
body = check[0].body if check else tree.body
has_assert = lambda s: any(isinstance(n, ast.Assert) for n in ast.walk(s))
emit({"units": sum(1 for s in body if has_assert(s))})

deadline = time.monotonic() + req["total_s"]
per = req["per_check_s"]
ns = {"__name__": "candidate", "__builtins__": builtins}
try:
    limit(per)
    exec(compile(req["code"], "<candidate>", "exec"), ns)
    clear()
    fn = ns.get(req["entry_point"])
    if not callable(fn):
        raise NameError("no function named %s" % req["entry_point"])
except BaseException as e:
    clear()
    emit({"load": "candidate", "error": "timeout" if isinstance(e, Timeout) else err(e)})
    emit({"done": True})
    sys.exit(0)

cns = {"__name__": "check", "__builtins__": builtins, "candidate": fn}
for s in prelude:
    try:
        exec(compile(ast.Module([s], []), "<test>", "exec"), cns)
    except BaseException:
        pass

for s in body:
    src = ast.get_source_segment(test, s) or ast.unparse(s)
    counted = has_assert(s)
    row = {"src": src if len(src) <= 2000 else src[:2000] + "...", "setup": not counted}
    left = time.monotonic() - deadline
    if left >= 0:
        if counted:
            emit({**row, "status": "timeout", "error": "check time limit reached"})
        continue
    try:
        limit(min(per, -left))
        t = s.test if isinstance(s, ast.Assert) else None
        if isinstance(t, ast.Compare) and len(t.ops) == 1:
            got = eval(compile(ast.Expression(t.left), "<test>", "eval"), cns)
            want = eval(compile(ast.Expression(t.comparators[0]), "<test>", "eval"), cns)
            cns["__l"], cns["__r"] = got, want
            cmp = ast.Expression(ast.Compare(ast.Name("__l", ast.Load()), t.ops, [ast.Name("__r", ast.Load())]))
            ok = bool(eval(compile(ast.fix_missing_locations(cmp), "<test>", "eval"), cns))
            row.update(call=ast.get_source_segment(test, t.left) or ast.unparse(t.left),
                       op=type(t.ops[0]).__name__, expected=show(want), got=show(got))
            row["status"] = "pass" if ok else "wrong"
        else:
            exec(compile(ast.Module([s], []), "<test>", "exec"), cns)
            row["status"] = "pass"
        clear()
    except Timeout:
        row["status"] = "timeout"
        row["error"] = "over %gs" % per
    except AssertionError:
        clear()
        row["status"] = "wrong"
    except BaseException as e:
        clear()
        row.update(status="error", error=err(e))
    if counted or row["status"] != "pass":
        emit(row)
emit({"done": True})
