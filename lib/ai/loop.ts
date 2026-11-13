import type Anthropic from "@anthropic-ai/sdk";
import type { AgentEvent } from "./events";
import type { ToolOutput } from "./exec";
import { EFFORT, MAX_TOKENS, MAX_TURNS, MODEL } from "./models";

/** The slice of the Anthropic SDK the loop uses, so tests can script a fake model. */
export interface StreamLike {
  on(event: "text", cb: (delta: string) => void): unknown;
  finalMessage(): Promise<Anthropic.Message>;
}
export interface AnthropicLike {
  messages: { stream(params: Record<string, unknown>, opts?: { signal?: AbortSignal }): StreamLike };
}

export type LoopOptions = {
  client: AnthropicLike;
  system: string;
  tools: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
  runTool: (name: string, input: unknown) => Promise<ToolOutput>;
  emit: (e: AgentEvent) => void;
  signal?: AbortSignal;
  deadline?: number; // epoch ms
  maxTurns?: number;
};
export type LoopResult = { stopReason: string; usage: { input: number; output: number }; turns: number };

const summarize = (name: string, input: unknown): string => {
  const i = (input ?? {}) as Record<string, unknown>;
  if (name === "notebook_create") return "Creating the notebook";
  if (name === "notebook_read") return `Reading (${String(i.mode ?? "outline")})`;
  if (name === "notebook_edit") return `Editing (${Array.isArray(i.ops) ? i.ops.length : 0} op${Array.isArray(i.ops) && i.ops.length === 1 ? "" : "s"})`;
  return name;
};

/**
 * Manual tool-use loop (spec §8.1). Tools run one at a time because they edit one shared document.
 * Assistant content (including thinking blocks) goes back unchanged on the next turn.
 */
export async function runLoop(o: LoopOptions): Promise<LoopResult> {
  const usage = { input: 0, output: 0 };
  const maxTurns = o.maxTurns ?? MAX_TURNS;
  let turns = 0;
  for (; turns < maxTurns; turns++) {
    if (o.signal?.aborted) return { stopReason: "stopped", usage, turns };
    if (o.deadline && Date.now() > o.deadline) {
      o.emit({ type: "error", code: "time_budget", message: "Stopped before the time limit. What I did so far is saved in the document; ask me to continue." });
      return { stopReason: "time_budget", usage, turns };
    }
    const stream = o.client.messages.stream(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: o.system,
        tools: o.tools,
        messages: o.messages,
        cache_control: { type: "ephemeral" }, // caches tools + system + conversation so far
        output_config: { effort: EFFORT },
      },
      { signal: o.signal },
    );
    stream.on("text", (delta) => o.emit({ type: "text", delta }));
    const msg = await stream.finalMessage();
    usage.input += (msg.usage?.input_tokens ?? 0) + (msg.usage?.cache_creation_input_tokens ?? 0) + (msg.usage?.cache_read_input_tokens ?? 0);
    usage.output += msg.usage?.output_tokens ?? 0;
    o.messages.push({ role: "assistant", content: msg.content });

    if (msg.stop_reason === "refusal") { o.emit({ type: "error", code: "refusal", message: "Claude declined this request." }); return { stopReason: "refusal", usage, turns: turns + 1 }; }
    if (msg.stop_reason === "max_tokens") { o.emit({ type: "error", code: "max_tokens", message: "The reply got too long. Try asking for one section at a time." }); return { stopReason: "max_tokens", usage, turns: turns + 1 }; }
    if (msg.stop_reason === "pause_turn") continue;
    if (msg.stop_reason !== "tool_use") return { stopReason: msg.stop_reason ?? "end_turn", usage, turns: turns + 1 };

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of msg.content) {
      if (block.type !== "tool_use") continue;
      if (o.signal?.aborted) return { stopReason: "stopped", usage, turns: turns + 1 };
      o.emit({ type: "tool", name: block.name, summary: summarize(block.name, block.input) });
      const out = await o.runTool(block.name, block.input);
      results.push({ type: "tool_result", tool_use_id: block.id, content: out.content, ...(out.isError ? { is_error: true } : {}) });
    }
    // All results in ONE user message.
    o.messages.push({ role: "user", content: results });
  }
  o.emit({ type: "error", code: "max_turns", message: "Stopped after the maximum number of steps. Ask me to continue." });
  return { stopReason: "max_turns", usage, turns };
}
