// Model calls shared by arena.mjs and impossible.mjs: an OpenAI-compatible
// endpoint or Claude through the official SDK, with a hard spend cap checked
// before every call. A reply is {text, usage, content, reasoning, finish}.

// USD per 1M tokens, [input, output]; thinking bills as output. From the claude-api reference, 2026-06-24.
export const PRICES = { "claude-opus-5-5": [4, 20], "claude-opus-5": [5, 25], "claude-sonnet-5": [2, 10], "claude-haiku-4-5": [1, 5] };

// provider: "openai-compatible" or "anthropic". budget in USD, 0 means no cap.
// stream: read the reply as server-sent events, so a long reasoning call is never cut by
// fetch's five-minute wait for response headers.
export function makeChat({ provider, model, base, keyEnv, effort, maxTokens, budget, stream = false }) {
  let spent = 0;
  let anthropic = null;

  async function chat(messages) {
    if (budget && spent >= budget) throw new Error(`budget reached: spent $${spent.toFixed(2)} of $${budget}`);
    if (provider === "anthropic") return chatAnthropic(messages);
    const r = await fetch(base + "/chat/completions", {
      method: "POST", headers: { "content-type": "application/json", ...(keyEnv ? { authorization: `Bearer ${process.env[keyEnv]}` } : {}) },
      body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: maxTokens, reasoning_effort: effort,
        ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}) }),
    });
    if (!r.ok) throw new Error(`model ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = stream ? await gather(r) : await r.json();
    spent += j.usage?.estimated_cost ?? 0;
    const m = j.choices[0].message;
    return { text: m.content ?? "", usage: j.usage ?? null, content: m.content ?? "",
      reasoning: m.reasoning_content ?? m.reasoning ?? "", finish: j.choices[0].finish_reason };
  }

  // Folds a stream of chat.completion.chunk events into the shape of one reply.
  async function gather(r) {
    let content = "", reasoning = "", finish = null, usage = null, buf = "";
    const dec = new TextDecoder();
    for await (const part of r.body) {
      buf += dec.decode(part, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        const c = JSON.parse(data);
        if (c.usage) usage = c.usage;
        const ch = c.choices?.[0];
        if (!ch) continue;
        content += ch.delta?.content ?? "";
        reasoning += ch.delta?.reasoning_content ?? ch.delta?.reasoning ?? "";
        finish = ch.finish_reason ?? finish;
      }
    }
    return { usage, choices: [{ message: { content, reasoning_content: reasoning }, finish_reason: finish }] };
  }

  // Claude through the official SDK; the request is anthropicParams below.
  async function chatAnthropic(messages) {
    if (!anthropic) { const { default: Anthropic } = await import("@anthropic-ai/sdk"); anthropic = new Anthropic(); }
    const price = PRICES[model];
    if (!price) throw new Error(`no price for ${model}; add it to PRICES before spending`);
    // Streamed and folded into one message: the SDK refuses a non-streamed call that could run past ten minutes.
    const r = await anthropic.messages.stream(anthropicParams({ model, maxTokens, effort }, messages)).finalMessage();
    const u = r.usage;
    const reply = anthropicReply(r, ((u.input_tokens + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1) * price[0] + u.output_tokens * price[1]) / 1e6);
    spent += reply.usage.estimated_cost;
    return reply;
  }

  return { chat, spent: () => spent };
}

// One Claude request, shared by the live path above and lib/batch.mjs so both
// send the same thing. The system prompt goes in `system`; the assistant's full
// content blocks (thinking included) are replayed unchanged, append-only. No
// temperature: current models reject sampling parameters. No fallbacks: a
// refusal is recorded as a refusal, never rerun on another model.
export function anthropicParams({ model, maxTokens, effort }, messages) {
  const [sys, ...rest] = messages;
  return { model, max_tokens: maxTokens, system: sys.content, thinking: { type: "adaptive" }, output_config: { effort }, messages: rest };
}

// A Claude message as the reply shape callers read. cost is in USD.
export function anthropicReply(r, cost) {
  const u = r.usage;
  const text = r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return { text: r.stop_reason === "refusal" ? `[refusal: ${r.stop_details?.category ?? "unknown"}]` : text,
    usage: { input_tokens: u.input_tokens, output_tokens: u.output_tokens, cache_read: u.cache_read_input_tokens ?? 0, estimated_cost: cost, stop_reason: r.stop_reason },
    content: r.content, reasoning: r.content.filter((b) => b.type === "thinking").map((b) => b.thinking).join("\n"), finish: r.stop_reason };
}
