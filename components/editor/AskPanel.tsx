"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { IconStop } from "@/components/ui/icons";
import { Kbd } from "@/components/ui/misc";
import { agentStore } from "@/lib/ai/client-store";

export const useAgent = () => useSyncExternalStore(agentStore.subscribe, agentStore.getSnapshot, agentStore.getServerSnapshot);

const EXAMPLES = ["Write a one-page plan for our Q1 launch", "Turn my notes into a short brief", "Compare three options in a table"];

/** Ask Claude: chat scoped to this notebook (spec F110). Also the empty-state prompt for a blank notebook (F113). */
export function AskPanel({ notebookId, tabId, canEdit, blank }: { notebookId: string; tabId: string; canEdit: boolean; blank?: boolean }) {
  const router = useRouter();
  const a = useAgent();
  const [draft, setDraft] = useState("");
  const [selection, setSelection] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { agentStore.ensureScope(notebookId); }, [notebookId]);
  const lastText = a.messages.at(-1)?.text;
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [a.messages.length, lastText]);
  useEffect(() => {
    const onAsk = (e: Event) => { setSelection((e as CustomEvent<{ text: string }>).detail.text); box.current?.focus(); };
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "k") { e.preventDefault(); box.current?.focus(); } };
    window.addEventListener("cn:ask-claude", onAsk);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("cn:ask-claude", onAsk); window.removeEventListener("keydown", onKey); };
  }, []);

  const send = () => {
    const message = draft.trim();
    if (!message || a.running || !canEdit) return;
    setDraft("");
    const sel = selection ?? undefined;
    setSelection(null);
    void agentStore.start({ message, notebookId, tabId, selection: sel, onCreated: ({ notebookId: nb }) => router.push(`/n/${nb}`) });
  };

  return (
    <section className="cn-panel" aria-label="Ask Claude" style={{ width: "100%", minHeight: 0, height: "100%" }}>
      <div className="cn-panel-head"><strong>Ask Claude</strong></div>
      <div className="cn-msgs" role="log" aria-live="polite" aria-relevant="additions text" style={{ overflowY: "auto" }}>
        {a.messages.length === 0 ? (
          <div style={{ display: "grid", gap: 8 }}>
            <p className="cn-caption" style={{ margin: 0 }}>{blank ? "This notebook is empty. What should it say?" : "Ask Claude to write, restructure or tighten this notebook."}</p>
            {canEdit ? EXAMPLES.map((ex) => <button key={ex} className="cn-item" style={{ border: 0, background: "none", font: "inherit", textAlign: "left" }} onClick={() => { setDraft(ex); box.current?.focus(); }}>{ex}</button>) : <p className="cn-caption">You have view or comment access. Editing with Claude needs edit access.</p>}
          </div>
        ) : null}
        {a.messages.map((m) => (
          <div key={m.id} className={`cn-msg ${m.role === "user" ? "cn-msg--user" : m.role === "assistant" ? "cn-msg--claude" : ""}`} role={m.role === "error" ? "alert" : undefined}
            style={m.role === "note" ? { color: "var(--cn-text-meta)", fontSize: 13, padding: "0 4px" } : m.role === "error" ? { color: "var(--cn-danger)", padding: "0 4px" } : undefined}>
            {m.role === "note" ? `· ${m.text}` : m.text}
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="cn-composer">
        {selection ? (
          <div className="cn-card" style={{ padding: "6px 10px", fontSize: 13 }}>
            <span className="cn-card-meta">About this selection</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>“{selection}”</span>
            <button className="cn-btn cn-btn--ghost cn-btn--sm" style={{ justifySelf: "start" }} onClick={() => setSelection(null)}>Clear</button>
          </div>
        ) : null}
        <Textarea ref={box} aria-label="Message Claude" placeholder={canEdit ? "Ask Claude to write or edit…" : "Editing with Claude needs edit access"} value={draft} disabled={!canEdit}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="cn-card-meta"><Kbd>⌘</Kbd> <Kbd>⇧</Kbd> <Kbd>K</Kbd></span>
          <span style={{ display: "flex", gap: 8 }}>
            {a.running ? <Button variant="secondary" size="sm" onClick={() => agentStore.stop()}><IconStop /> Stop</Button> : null}
            <Button size="sm" disabled={!draft.trim() || a.running || !canEdit} onClick={send}>{a.running ? "Working…" : "Send"}</Button>
          </span>
        </div>
      </div>
    </section>
  );
}
