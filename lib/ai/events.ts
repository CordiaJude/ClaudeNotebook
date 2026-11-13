/** What the server streams to the Ask Claude panel (SSE `data:` lines, one JSON per event). */
export type AgentEvent =
  | { type: "status"; text: string }
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; summary: string }
  | { type: "section"; label: string }
  | { type: "created"; notebookId: string; tabId: string }
  | { type: "done"; stopReason: string; usage: { input: number; output: number } }
  | { type: "error"; code: string; message: string };
