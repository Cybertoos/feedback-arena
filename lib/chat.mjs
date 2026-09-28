// Model calls shared by arena.mjs and impossible.mjs: an OpenAI-compatible
// endpoint or Claude through the official SDK, with a hard spend cap checked
// before every call. A reply is {text, usage, content, reasoning, finish}.

// USD per 1M tokens, [input, output]; thinking bills as output. From the claude-api reference, 2026-06-24.
export const PRICES = { "claude-opus-5-5": [4, 20], "claude-opus-5": [5, 25], "claude-sonnet-5": [2, 10], "claude-haiku-4-5": [1, 5] };

// provider: "openai-compatible" or "anthropic". budget in USD, 0 means no cap.
export function makeChat({ provider, model, base, keyEnv, effort, maxTokens, budget }) {
  let spent = 0;
  let anthropic = null;

  async function chat(messages) {
    if (budget && spent >= budget) throw new Error(`budget reached: spent $${spent.toFixed(2)} of $${budget}`);
    if (provider === "anthropic") return chatAnthropic(messages);
    const r = await fetch(base + "/chat/completions", {
      method: "POST", headers: { "content-type": "application/json", ...(keyEnv ? { authorization: `Bearer ${process.env[keyEnv]}` } : {}) },
      body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: maxTokens, reasoning_effort: effort }),
    });
    if (!r.ok) throw new Error(`model ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    spent += j.usage?.estimated_cost ?? 0;
    const m = j.choices[0].message;
    return { text: m.content ?? "", usage: j.usage ?? null, content: m.content ?? "",
      reasoning: m.reasoning_content ?? m.reasoning ?? "", finish: j.choices[0].finish_reason };
  }

  // Claude through the official SDK. The system prompt goes in `system`; the
  // assistant's full content blocks (thinking included) are replayed unchanged,
  // append-only. No temperature: current models reject sampling parameters.
  // No fallbacks: a refusal is recorded as a refusal, never rerun on another model.
  async function chatAnthropic(messages) {
    if (!anthropic) { const { default: Anthropic } = await import("@anthropic-ai/sdk"); anthropic = new Anthropic(); }
    const [sys, ...rest] = messages;
    const r = await anthropic.messages.create({
      model, max_tokens: maxTokens, system: sys.content,
      thinking: { type: "adaptive" }, output_config: { effort },
      messages: rest,
    });
    const price = PRICES[model];
    if (!price) throw new Error(`no price for ${model}; add it to PRICES before spending`);
    const u = r.usage;
    const cost = ((u.input_tokens + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1) * price[0] + u.output_tokens * price[1]) / 1e6;
    spent += cost;
    const text = r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    return { text: r.stop_reason === "refusal" ? `[refusal: ${r.stop_details?.category ?? "unknown"}]` : text,
      usage: { input_tokens: u.input_tokens, output_tokens: u.output_tokens, cache_read: u.cache_read_input_tokens ?? 0, estimated_cost: cost, stop_reason: r.stop_reason },
      content: r.content, reasoning: r.content.filter((b) => b.type === "thinking").map((b) => b.thinking).join("\n"), finish: r.stop_reason };
  }

  return { chat, spent: () => spent };
}
