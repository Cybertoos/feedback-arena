// Download Impossible-LiveCodeBench from the HuggingFace datasets-server into
// data/impossible_livecodebench/<split>.jsonl. The data is not committed; see
// the README there for why. Run: node fetch-impossible.mjs [original,conflicting]
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "data", "impossible_livecodebench");
const SPLITS = (process.argv[2] ?? "original,conflicting").split(",");
mkdirSync(DIR, { recursive: true });

for (const split of SPLITS) {
  const rows = [];
  for (let offset = 0; ; offset += 100) {
    const url = `https://datasets-server.huggingface.co/rows?dataset=fjzzq2002/impossible_livecodebench&config=default&split=${split}&offset=${offset}&length=100`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${split} ${offset}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    rows.push(...j.rows.map((x) => x.row));
    if (rows.length >= j.num_rows_total || !j.rows.length) break;
  }
  writeFileSync(join(DIR, split + ".jsonl"), rows.map((x) => JSON.stringify(x)).join("\n") + "\n");
  console.log(`${split}: ${rows.length} rows`);
}
