// Pins the statistics analyze-impossible.mjs reports, against known values.
import { wilson, mcnemar, holm } from "./analyze-impossible.mjs";
let fail = 0;
const near = (name, got, want, tol = 1e-4) => { const ok = Math.abs(got - want) <= tol; if (!ok) fail++; console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${got} (want ${want})`); };
near("wilson 0/3 upper", wilson(0, 3)[1], 0.5615);
near("wilson 5/10 lower", wilson(5, 10)[0], 0.2366);
near("mcnemar 0 vs 6", mcnemar(0, 6), 0.03125);
near("mcnemar 1 vs 1", mcnemar(1, 1), 1);
near("mcnemar 2 vs 10", mcnemar(2, 10), 0.03857);
near("mcnemar none discordant", mcnemar(0, 0), 1);
const h = holm([0.01, 0.04, 0.03]);
near("holm smallest", h[0], 0.03); near("holm largest", h[1], 0.06); near("holm middle", h[2], 0.06);
console.log(fail ? `${fail} failed` : "all hold");
process.exit(fail ? 1 : 0);
