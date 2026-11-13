import type Anthropic from "@anthropic-ai/sdk";
import * as Y from "yjs";
import { applyOps } from "@/lib/ops/engine";
import { serverSchema } from "@/lib/ops/schema";
import { readPM, writePM } from "@/lib/ops/ydoc";
import type { Op } from "@/lib/ops/types";
import type { AgentEvent } from "@/lib/ai/events";
import { makeToolRunner, type NotebookBackend, type Role, type RoomStore, type RunState } from "@/lib/ai/exec";
import type { AnthropicLike } from "@/lib/ai/loop";

export class MemRooms implements RoomStore {
  docs = new Map<string, Y.Doc>();
  async ensure(room: string) { if (!this.docs.has(room)) this.docs.set(room, new Y.Doc()); }
  async load(room: string) { const d = this.docs.get(room); return d ? Y.encodeStateAsUpdate(d) : null; }
  async save(room: string, delta: Uint8Array) { await this.ensure(room); Y.applyUpdate(this.docs.get(room)!, delta); }
  doc(room: string) { return readPM(this.docs.get(room)!, serverSchema()); }
  /** A person edits the live doc. */
  human(room: string, ops: Op[]) {
    const y = this.docs.get(room)!;
    const r = applyOps(readPM(y, serverSchema()), ops, { schema: serverSchema(), ctx: { me: { id: "h", name: "Human" } } });
    if (!r.ok) throw new Error(JSON.stringify(r));
    Y.applyUpdate(y, writePM(y, r.doc, "human"));
  }
}

export class MemBackend implements NotebookBackend {
  created: { notebookId: string; tabId: string; room: string; title: string }[] = [];
  constructor(public role: Role = "owner") {}
  async createNotebook(title: string) { const n = this.created.length + 1; const r = { notebookId: `nb${n}`, tabId: `tab${n}`, room: `nb:nb${n}:tab:tab${n}` }; this.created.push({ ...r, title }); return r; }
  async resolveTab(tabId: string) { const c = this.created.find((x) => x.tabId === tabId); return c ? { notebookId: c.notebookId, tabId, room: c.room, role: this.role, name: "Main" } : null; }
}

export function harness(role: Role = "owner") {
  const rooms = new MemRooms();
  const backend = new MemBackend(role);
  const events: AgentEvent[] = [];
  const state: RunState = { lastRead: new Map(), me: { id: "u-me", name: "Ada" }, runId: "run1" };
  const runTool = makeToolRunner({ rooms, backend, emit: (e) => events.push(e), state });
  return { rooms, backend, events, state, runTool };
}

type Content = Anthropic.Message["content"];
export const textBlock = (text: string) => ({ type: "text", text, citations: null }) as unknown as Content[number];
export const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input }) as unknown as Content[number];
export const reply = (content: Content, stop: Anthropic.Message["stop_reason"] = "tool_use"): Anthropic.Message =>
  ({ id: "m", type: "message", role: "assistant", model: "x", content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }) as unknown as Anthropic.Message;

/** Scripted model: `fn` sees the conversation so far and the call index and returns the next assistant message. */
export function fakeClient(fn: (messages: Anthropic.MessageParam[], call: number) => Anthropic.Message | Promise<Anthropic.Message>) {
  const calls: Record<string, unknown>[] = [];
  const client: AnthropicLike = {
    messages: {
      stream(params) {
        calls.push(params);
        const idx = calls.length - 1;
        const cbs: ((d: string) => void)[] = [];
        return {
          on(_e, cb) { cbs.push(cb); },
          async finalMessage() {
            const m = await fn(JSON.parse(JSON.stringify(params.messages)) as Anthropic.MessageParam[], idx);
            for (const b of m.content) if (b.type === "text") cbs.forEach((cb) => cb(b.text));
            return m;
          },
        };
      },
    },
  };
  return { client, calls };
}

/** Parse the last tool_result message into objects. */
export function lastResults(messages: Anthropic.MessageParam[]): { id: string; isError: boolean; json: Record<string, unknown> }[] {
  const last = messages.at(-1)!;
  const arr = Array.isArray(last.content) ? last.content : [];
  return arr.filter((b) => b.type === "tool_result").map((b) => ({ id: (b as { tool_use_id: string }).tool_use_id, isError: !!(b as { is_error?: boolean }).is_error, json: JSON.parse(String((b as { content: string }).content)) }));
}

export const SKELETON = `# Q1 launch plan

<?cn block asof?> · <?cn block me?>

<?cn block s1?>

<?cn block s2?>

<?cn block s3?>`;
export const SKELETON_BLOCKS = {
  asof: { type: "date", value: "2026-11-12" },
  me: { type: "mention", user: "me" },
  s1: { type: "pending", intent: "Goals: the three outcomes this quarter commits to" },
  s2: { type: "pending", intent: "Risks: what could slip and the fallback" },
  s3: { type: "pending", intent: "Timeline: milestones by date" },
};
