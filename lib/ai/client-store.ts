import type { AgentEvent } from "./events";

export type ChatMsg = { id: string; role: "user" | "assistant" | "note" | "error"; text: string };
export type AgentState = { messages: ChatMsg[]; running: boolean; section: string | null; scope: string | null };

/**
 * One conversation + one run at a time, living outside React so a run that starts on the notebooks list
 * keeps streaming while the app navigates into the notebook it just created.
 */
let state: AgentState = { messages: [], running: false, section: null, scope: null };
const listeners = new Set<() => void>();
let controller: AbortController | null = null;
let seq = 0;

const set = (patch: Partial<AgentState>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
const push = (m: Omit<ChatMsg, "id">) => set({ messages: [...state.messages, { ...m, id: String(++seq) }] });
const appendToLast = (delta: string) => {
  const last = state.messages.at(-1);
  if (last?.role === "assistant") set({ messages: [...state.messages.slice(0, -1), { ...last, text: last.text + delta }] });
  else push({ role: "assistant", text: delta });
};

export const agentStore = {
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
  getSnapshot: () => state,
  getServerSnapshot: (): AgentState => ({ messages: [], running: false, section: null, scope: null }),

  /** Switching to a different notebook starts a fresh conversation (unless a run is mid-flight). */
  ensureScope(notebookId: string | null) {
    if (state.scope !== notebookId && !state.running) set({ scope: notebookId, messages: [], section: null });
  },

  stop() { controller?.abort(); },

  async start(opts: { message: string; notebookId?: string; tabId?: string; selection?: string; onCreated?: (e: { notebookId: string; tabId: string }) => void }) {
    if (state.running) return;
    const history = state.messages.filter((m) => m.role === "user" || m.role === "assistant").slice(-10).map((m) => ({ role: m.role as "user" | "assistant", text: m.text }));
    push({ role: "user", text: opts.message });
    set({ running: true, section: null });
    controller = new AbortController();
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ message: opts.message, notebookId: opts.notebookId, tabId: opts.tabId, selection: opts.selection, trigger: opts.selection ? "selection" : "panel", history }),
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        push({ role: "error", text: j.message ?? "Something went wrong." });
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          if (!chunk.startsWith("data: ")) continue;
          let e: AgentEvent;
          try { e = JSON.parse(chunk.slice(6)) as AgentEvent; } catch { continue; }
          handle(e, opts);
        }
      }
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") push({ role: "note", text: "Stopped." });
      else push({ role: "error", text: "The connection dropped. What was done so far is saved in the document." });
    } finally {
      set({ running: false, section: null });
      controller = null;
    }
  },
};

function handle(e: AgentEvent, opts: { onCreated?: (e: { notebookId: string; tabId: string }) => void }) {
  switch (e.type) {
    case "text": appendToLast(e.delta); break;
    case "tool": push({ role: "note", text: e.summary }); break;
    case "section": set({ section: e.label }); break;
    case "created": set({ scope: e.notebookId }); opts.onCreated?.({ notebookId: e.notebookId, tabId: e.tabId }); break;
    case "error": push({ role: "error", text: e.message }); break;
    case "status": case "done": break;
  }
}
