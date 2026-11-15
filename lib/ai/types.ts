/* The seam between the product and whichever model writes for it. The product only knows this interface;
   /replica-backend plugs a hosted model into it. Until then the scripted model in ./scripted.ts stands in. */
export type ToolDef = { name: string; description: string; input: Record<string, unknown> };
export type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type Msg = { role: "user" | "assistant"; content: string | Block[] };
export type Turn = { blocks: Block[]; stop: "end" | "tool" | "limit" | "refused"; usage: { input: number; output: number } };
export interface Model {
  name: string;
  /** True for the stand-in. The UI says so, so nobody mistakes canned text for a real model. */
  demo: boolean;
  turn(req: { system: string; tools: ToolDef[]; messages: Msg[]; signal: AbortSignal; onText?: (delta: string) => void }): Promise<Turn>;
}

/** What the server streams to the chat panel, one JSON object per SSE `data:` line. */
export type RunEvent =
  | { type: "start"; runId: string; userMessage: import("@/lib/data/types").Message }
  | { type: "text"; delta: string }
  | { type: "progress"; label: string; done?: boolean }
  | { type: "message"; message: import("@/lib/data/types").Message }
  | { type: "done"; status: "done" | "stopped" | "awaiting_answers" | "error" }
  | { type: "error"; message: string };
