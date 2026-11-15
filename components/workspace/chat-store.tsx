"use client";
/* The chat beside the editor: what was said, what is running, and the calls that start, answer, stop and undo AI work. */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { RunEvent } from "@/lib/ai/types";
import type { Message } from "@/lib/data/types";

export type Progress = { label: string; done: boolean };
export type UndoOutcome = { ok: true } | { ok: false; conflicts?: string[]; message?: string };
type Chat = {
  messages: Message[]; running: boolean; streaming: string; progress: Progress[]; section: string | null;
  /** A request that never started (offline, refused, over the allowance), with what to resend. */
  failed: { message: string; retry?: () => void } | null;
  send(text: string): void;
  answer(messageId: string, values: Record<string, string> | "skipped"): void;
  stop(): void;
  undo(runId: string, force?: boolean): Promise<UndoOutcome>;
  append(messages: Message[]): void;
};
const Ctx = createContext<Chat | null>(null);
export const useChat = (): Chat => { const c = useContext(Ctx); if (!c) throw new Error("useChat outside ChatProvider"); return c; };

export function ChatProvider({ artifactId, initial, onSettled, children }: { artifactId: string; initial: Message[]; onSettled?: () => void; children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>(initial);
  const [running, setRunning] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [progress, setProgress] = useState<Progress[]>([]);
  const [failed, setFailed] = useState<Chat["failed"]>(null);
  const abort = useRef<AbortController | null>(null);
  const runId = useRef<string | null>(null);

  const run = useCallback(async (body: Record<string, unknown>, optimistic: Message | null, retry: () => void) => {
    if (abort.current) return;
    const ctl = new AbortController();
    abort.current = ctl;
    setRunning(true); setFailed(null); setStreaming(""); setProgress([]);
    if (optimistic) setMessages((m) => [...m, optimistic]);
    const dropOptimistic = () => { if (optimistic) setMessages((m) => m.filter((x) => x.id !== optimistic.id)); };
    try {
      const res = await fetch("/api/ai/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "chat", artifactId, ...body }), signal: ctl.signal });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        dropOptimistic();
        setFailed({ message: j?.message ?? "That did not go through. Check your connection and try again.", retry: res.status >= 500 || res.status === 0 ? retry : undefined });
        return;
      }
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "";
      const handle = (e: RunEvent) => {
        if (e.type === "start") runId.current = e.runId;
        if (e.type === "start") setMessages((m) => [...m.filter((x) => x.id !== optimistic?.id), e.userMessage]);
        else if (e.type === "text") setStreaming((s) => s + e.delta);
        else if (e.type === "progress") setProgress((p) => { const last = p.at(-1); return e.done && last && !last.done ? [...p.slice(0, -1), { label: e.label, done: true }] : [...p, { label: e.label, done: !!e.done }]; });
        else if (e.type === "message") { setStreaming(""); setMessages((m) => [...m, e.message]); }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        for (let i = buf.indexOf("\n\n"); i >= 0; i = buf.indexOf("\n\n")) { const line = buf.slice(0, i); buf = buf.slice(i + 2); if (line.startsWith("data: ")) handle(JSON.parse(line.slice(6)) as RunEvent); }
      }
    } catch {
      if (!ctl.signal.aborted) { dropOptimistic(); setFailed({ message: "The connection dropped. What was written so far is saved.", retry }); }
    } finally {
      abort.current = null; runId.current = null;
      setRunning(false); setStreaming("");
      setProgress((p) => p.map((x) => ({ ...x, done: true })));
      // After a stop the server records what happened; fetch it so the transcript (and the Undo button) is right.
      if (ctl.signal.aborted) { await new Promise((r) => setTimeout(r, 600)); try { const r = await fetch(`/api/ai/messages?artifactId=${artifactId}`); if (r.ok) setMessages(((await r.json()) as { messages: Message[] }).messages); } catch { /* keep what we have */ } }
      onSettled?.();
    }
  }, [artifactId, onSettled]);

  const api = useMemo<Chat>(() => ({
    messages, running, streaming, progress, failed,
    section: running ? (progress.findLast((p) => !p.done)?.label.replace(/^Drafting section \d+ of \d+: /, "") ?? null) : null,
    send(text) {
      const optimistic: Message = { id: `local-${Date.now()}`, role: "user", content: { kind: "text", text }, createdAt: new Date().toISOString() };
      void run({ message: text }, optimistic, () => api.send(text));
    },
    answer(messageId, values) {
      setMessages((m) => m.map((x) => (x.id === messageId && x.content.kind === "questions" ? { ...x, content: { ...x.content, answered: values } } : x)));
      void run({ answers: { messageId, values } }, null, () => api.answer(messageId, values));
    },
    stop() {
      // Ask the server to stop: the stream then ends by itself with a record of what was kept.
      // If that request cannot reach the run, cut the connection instead; the server stops when the reader goes away.
      const ctl = abort.current, id = runId.current;
      if (!ctl) return;
      if (!id) { ctl.abort(); return; }
      fetch(`/api/ai/runs/${id}/stop`, { method: "POST" }).then((r) => r.json()).then((j: { stopped?: boolean }) => { if (!j.stopped) ctl.abort(); }).catch(() => ctl.abort());
      setTimeout(() => { if (abort.current === ctl) ctl.abort(); }, 5000);
    },
    async undo(runId, force) {
      try {
        const res = await fetch(`/api/ai/runs/${runId}/undo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: !!force }) });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; conflicts?: string[]; message?: string };
        if (res.ok && j.ok) { setMessages((m) => m.map((x) => (x.runId === runId && x.content.kind === "text" ? { ...x, undoable: false, content: { ...x.content, undone: true } } : x))); onSettled?.(); return { ok: true }; }
        return { ok: false, conflicts: j.conflicts, message: j.message };
      } catch { return { ok: false, message: "The connection dropped. Nothing was undone." }; }
    },
    append(more) { setMessages((m) => [...m, ...more]); },
  }), [messages, running, streaming, progress, failed, run, onSettled]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
