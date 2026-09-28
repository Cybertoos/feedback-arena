// Runs model-written Python against a check() source, inside a throwaway Docker
// container: no network, read-only root, 64 MB /tmp, 256 MB RAM, one CPU, 64
// pids, user nobody, no capabilities. Model code never runs outside it.
// Returns [{src, status: pass|wrong|error|timeout, call?, expected?, got?, error?}].

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const HARNESS = readFileSync(new URL("./pyharness.py", import.meta.url), "utf8");
export const IMAGE = "python:3.12-slim";

export function dockerArgs(name) {
  return ["run", "--rm", "--name", name, "--network", "none", "--read-only", "--tmpfs", "/tmp:rw,size=64m",
    "--memory", "256m", "--memory-swap", "256m", "--cpus", "1", "--pids-limit", "64", "--user", "65534:65534",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "-i", IMAGE, "python3", "-I", "-c", HARNESS];
}

// totalS bounds the whole check inside; the container gets totalS + startS on the
// wall clock and is killed after that.
export function runCheck(code, test, entryPoint, { perCheckS = 2, totalS = 10, startS = 15 } = {}) {
  const name = "fa-" + randomBytes(6).toString("hex");
  const r = spawnSync("docker", dockerArgs(name), {
    input: JSON.stringify({ code, test, entry_point: entryPoint, per_check_s: perCheckS, total_s: totalS }),
    encoding: "utf8", timeout: (totalS + startS) * 1000, killSignal: "SIGKILL", maxBuffer: 16 << 20,
  });
  // The docker client is SIGKILLed on timeout (it would wait on the container);
  // the container itself is then removed by name.
  const killed = r.error?.code === "ETIMEDOUT" || r.signal === "SIGKILL";
  if (killed) spawnSync("docker", ["rm", "-f", name], { encoding: "utf8" });
  const lines = (r.stdout ?? "").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const units = lines.find((l) => "units" in l)?.units;
  const load = lines.find((l) => l.load);
  if (units === undefined && !load) {
    // The container never answered: docker missing, image missing, or killed at start.
    const why = killed ? "container killed at the wall limit" : `sandbox: ${(r.stderr || r.error?.message || "no output").trim().slice(0, 200)}`;
    return [{ src: "(whole check)", status: killed ? "timeout" : "error", error: why, infra: !killed }];
  }
  if (load) return [{ src: load.load === "test" ? "(test source)" : "(loading your code)", status: load.error === "timeout" ? "timeout" : "error", error: load.error }];
  const rows = lines.filter((l) => "status" in l);
  const done = lines.some((l) => l.done);
  const seen = rows.filter((x) => !x.setup).length;
  // Checks the harness never reached: the container was killed or the process died.
  for (let i = seen; i < units; i++) rows.push({ src: "(not reached)", status: killed ? "timeout" : "error", error: killed ? "container killed at the wall limit" : done ? "missing result" : "the Python process exited" });
  return rows;
}

export function dockerReady() {
  const r = spawnSync("docker", ["image", "inspect", IMAGE, "--format", "ok"], { encoding: "utf8" });
  return r.status === 0 ? null : (r.stderr || r.error?.message || "docker unavailable").trim();
}
