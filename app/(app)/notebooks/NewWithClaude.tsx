"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { IconStop } from "@/components/ui/icons";
import { agentStore } from "@/lib/ai/client-store";
import { useAgent } from "@/components/editor/AskPanel";

/** Birth flow entry (spec §1): ask, and the notebook opens as soon as Claude has laid out its sections. */
export function NewWithClaude() {
  const router = useRouter();
  const a = useAgent();
  const [text, setText] = useState("");
  const lastNote = [...a.messages].reverse().find((m) => m.role === "note" || m.role === "error");
  const go = () => {
    const message = text.trim();
    if (!message || a.running) return;
    setText("");
    void agentStore.start({ message, onCreated: ({ notebookId }) => router.push(`/n/${notebookId}`) });
  };
  return (
    <section aria-label="Write with Claude" className="cn-card" style={{ marginBottom: 32, padding: 16 }}>
      <h2 className="cn-eyebrow">Write with Claude</h2>
      <Textarea aria-label="What should Claude write?" placeholder="e.g. Write a one-page plan for our Q1 launch" value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); go(); } }} />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Button disabled={!text.trim() || a.running} onClick={go}>{a.running ? "Claude is starting…" : "Write it"}</Button>
        {a.running ? <Button variant="secondary" onClick={() => agentStore.stop()}><IconStop /> Stop</Button> : null}
        {lastNote ? <span className="cn-caption" role={lastNote.role === "error" ? "alert" : "status"} style={{ color: lastNote.role === "error" ? "var(--cn-danger)" : undefined }}>{lastNote.text}</span> : null}
      </div>
    </section>
  );
}
