// Claude through the Message Batches API, at half the price, behind the same
// chat(messages) -> reply interface as lib/chat.mjs. Callers ask as usual;
// requests queue until the queue has been quiet for IDLE_MS, then go out as one
// batch. Every result is cached on disk by a hash of its exact request, and
// every batch id is written down before it is polled, so a restart replays for
// free and collects a batch that was already paid for.

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { anthropicParams, anthropicReply, PRICES } from "./chat.mjs";

const IDLE_MS = 5000, POLL_MS = 60000, BATCH_DISCOUNT = 0.5;

export function makeBatchChat({ model, effort, maxTokens, budget, dir }) {
  const cacheDir = join(dir, "batch-cache");
  mkdirSync(cacheDir, { recursive: true });
  const ledger = join(dir, "batches.jsonl");
  let spent = 0, client = null, queue = [], timer = null, flushing = Promise.resolve();
  const price = PRICES[model];
  if (!price) throw new Error(`no price for ${model}; add it to PRICES before spending`);

  const api = async () => {
    if (!client) { const { default: Anthropic } = await import("@anthropic-ai/sdk"); client = new Anthropic(); }
    return client;
  };
  const hashOf = (params) => createHash("sha256").update(JSON.stringify(params)).digest("hex");
  const cached = (h) => { const p = join(cacheDir, h + ".json"); return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null; };
  const cost = (u) => BATCH_DISCOUNT * ((u.input_tokens + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1) * price[0] + u.output_tokens * price[1]) / 1e6;

  // Waits for a batch to end and caches every result it holds. An errored or
  // expired request is cached as an error, so its caller retries it.
  async function collect(id, hashes) {
    const c = await api();
    for (;;) {
      const b = await c.messages.batches.retrieve(id);
      if (b.processing_status === "ended") break;
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    for await (const res of await c.messages.batches.results(id)) {
      const h = hashes[res.custom_id];
      if (!h) continue;
      const body = res.result.type === "succeeded" ? { message: res.result.message }
        : { error: `${res.result.type}${res.result.error ? ": " + JSON.stringify(res.result.error).slice(0, 200) : ""}` };
      writeFileSync(join(cacheDir, h + ".json"), JSON.stringify(body));
    }
  }

  // Batches from an earlier process whose results were never collected.
  async function recover() {
    if (!existsSync(ledger)) return;
    for (const l of readFileSync(ledger, "utf8").trim().split("\n").filter(Boolean)) {
      const { id, hashes } = JSON.parse(l);
      if (Object.values(hashes).some((h) => !cached(h))) { console.log(`collecting batch ${id} from an earlier process`); await collect(id, hashes); }
    }
  }
  const recovered = recover();

  async function flush() {
    const items = queue; queue = [];
    if (!items.length) return;
    if (budget && spent >= budget) { for (const it of items) it.reject(new Error(`budget reached: spent $${spent.toFixed(2)} of $${budget}`)); return; }
    const requests = [], hashes = {};
    items.forEach((it, i) => { const id = "r" + i; hashes[id] = it.hash; requests.push({ custom_id: id, params: it.params }); });
    try {
      const c = await api();
      const b = await c.messages.batches.create({ requests });
      appendFileSync(ledger, JSON.stringify({ id: b.id, at: new Date().toISOString(), hashes }) + "\n");
      console.log(`batch ${b.id}: ${requests.length} request(s)`);
      await collect(b.id, hashes);
    } catch (e) {
      // Each caller's own retry decides what happens next; nothing waits forever.
      for (const it of items) if (!cached(it.hash)) it.reject(new Error(`batch failed: ${e.message}`));
    }
    for (const it of items) if (cached(it.hash)) settle(it);
  }

  function settle(it) {
    const hit = cached(it.hash);
    if (!hit) return it.reject(new Error("batch ended without a result for this request"));
    if (hit.error) return it.reject(new Error(hit.error));
    const reply = anthropicReply(hit.message, cost(hit.message.usage));
    spent += reply.usage.estimated_cost;
    it.resolve(reply);
  }

  async function chat(messages) {
    await recovered;
    const params = anthropicParams({ model, maxTokens, effort }, messages);
    const hash = hashOf(params);
    return new Promise((resolve, reject) => {
      const it = { params, hash, resolve, reject };
      if (cached(hash)) return settle(it); // a replay after a restart costs nothing new
      queue.push(it);
      clearTimeout(timer);
      timer = setTimeout(() => { flushing = flushing.then(flush); }, IDLE_MS);
    });
  }

  return { chat, spent: () => spent };
}
