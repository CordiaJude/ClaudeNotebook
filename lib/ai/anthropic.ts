/* The hosted model, behind the same interface as the scripted stand-in. One call here is one model turn;
   the loop, the tools and every document change stay in ./run.ts and ./tools.ts. */
import Anthropic from "@anthropic-ai/sdk";
import type { Block, Model, Msg, Turn } from "./types";

const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const MAX_TOKENS = 32_000;

/** After a mid-reply fallback, the reasoning and tool calls from before the switch must not be sent back; everything else is echoed as it was. */
function replayable(content: Anthropic.Beta.BetaContentBlock[]): Anthropic.Beta.BetaContentBlockParam[] {
  const cut = content.map((b) => b.type as string).lastIndexOf("fallback");
  const kept = cut < 0 ? content : content.filter((b, i) => i >= cut || !["thinking", "redacted_thinking", "tool_use"].includes(b.type));
  return kept as unknown as Anthropic.Beta.BetaContentBlockParam[];
}

function toParams(messages: Msg[]): Anthropic.Beta.BetaMessageParam[] {
  return messages.map((m): Anthropic.Beta.BetaMessageParam => {
    if (typeof m.content === "string") return { role: m.role, content: m.content };
    // Our own earlier turns go back exactly as the model produced them, reasoning included.
    if (m.role === "assistant" && Array.isArray(m.raw)) return { role: "assistant", content: replayable(m.raw as Anthropic.Beta.BetaContentBlock[]) };
    return {
      role: m.role,
      content: m.content.map((b): Anthropic.Beta.BetaContentBlockParam =>
        b.type === "text" ? { type: "text", text: b.text }
          : b.type === "tool_use" ? { type: "tool_use", id: b.id, name: b.name, input: b.input }
            : { type: "tool_result", tool_use_id: b.tool_use_id, content: b.content, ...(b.is_error ? { is_error: true } : {}) }),
    };
  });
}

export function anthropicModel(opts: { apiKey: string; model: string }): Model {
  const client = new Anthropic({ apiKey: opts.apiKey });
  return {
    name: opts.model,
    demo: false,
    async turn({ system, tools, messages, signal, effort, onText }): Promise<Turn> {
      const params: Parameters<typeof client.beta.messages.stream>[0] = {
        model: opts.model,
        max_tokens: MAX_TOKENS,
        system,
        messages: toParams(messages),
        // Inputs stream as they are written; ./tools.ts checks every input against its schema before anything runs.
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input as Anthropic.Beta.BetaTool.InputSchema, eager_input_streaming: true })),
        output_config: { effort: effort ?? "medium" },
        cache_control: { type: "ephemeral" },
        // If the model declines for a policy reason, the request is retried on the provider's recommended substitute.
        betas: [FALLBACK_BETA],
        fallbacks: "default",
      };
      for (let attempt = 0; ; attempt++) {
        const stream = client.beta.messages.stream(params, { signal });
        if (onText) stream.on("text", (delta) => onText(delta));
        let message: Anthropic.Beta.BetaMessage;
        try { message = await stream.finalMessage(); }
        catch (err) {
          // A tool input that could not be parsed at all: ask again, twice at most. Real API errors are not retried here.
          if (err instanceof Anthropic.APIError || signal.aborted || attempt >= 2) throw err;
          continue;
        }
        const blocks: Block[] = [];
        for (const b of message.content) {
          if (b.type === "text") blocks.push({ type: "text", text: b.text });
          else if (b.type === "tool_use") blocks.push({ type: "tool_use", id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> });
        }
        const stop: Turn["stop"] = message.stop_reason === "refusal" ? "refused" : message.stop_reason === "max_tokens" ? "limit" : message.stop_reason === "tool_use" ? "tool" : "end";
        const u = message.usage;
        return {
          blocks, stop, raw: message.content,
          usage: { input: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), output: u.output_tokens ?? 0 },
        };
      }
    },
  };
}
