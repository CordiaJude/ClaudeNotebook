"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ControlledDialog } from "@/components/ui/overlays";
import { Badge } from "@/components/ui/misc";
import { IconSparkle } from "@/components/ui/icons";
import { ChatMessage, ProgressLine, PromptBox, QuestionsCard } from "@/components/doc/parts";
import type { Message } from "@/lib/data/types";
import { useChat } from "./chat-store";

const EXAMPLES = ["Write a one-page plan for our Q1 launch", "Draft a memo on moving to a four-day week", "Write a short update on last month's results"];

function Bubble({ m, onUndo, onAnswer, live }: { m: Message; onUndo: (runId: string) => void; onAnswer: (id: string, v: Record<string, string> | "skipped") => void; live: boolean }) {
  const c = m.content;
  if (c.kind === "error") return <ChatMessage role="error">{c.text}</ChatMessage>;
  if (c.kind === "questions") {
    const answered = c.answered === "skipped" ? {} : c.answered;
    return <QuestionsCard questions={c.questions} answered={c.answered ? answered : live ? undefined : {}} onSubmit={(a) => onAnswer(m.id, a)} onSkip={() => onAnswer(m.id, "skipped")} />;
  }
  if (c.kind === "answers") return <ChatMessage role="user">{c.values === "skipped" ? "Skip the questions, just draft." : Object.values(c.values).filter(Boolean).join(" · ") || "No preference."}</ChatMessage>;
  if (m.role === "user") return <ChatMessage role="user">{c.text}</ChatMessage>;
  return (
    <ChatMessage role="ai" onUndo={m.undoable && m.runId ? () => onUndo(m.runId!) : undefined}>
      {c.text}{c.undone ? <span className="ui-card-meta"> Undone.</span> : null}
    </ChatMessage>
  );
}

export function Chat({ canEdit, demo, kind, firstPrompt }: { canEdit: boolean; demo: boolean; kind: "doc" | "deck"; firstPrompt?: string }) {
  const chat = useChat();
  const end = useRef<HTMLDivElement>(null);
  const sent = useRef(false);
  const [conflict, setConflict] = useState<{ runId: string; blocks: string[] } | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [chat.messages.length, chat.streaming, chat.progress.length]);
  // A prompt typed on the library page arrives here and is sent once.
  useEffect(() => {
    if (firstPrompt && canEdit && !sent.current && chat.messages.length === 0) { sent.current = true; chat.send(firstPrompt); }
  }, [firstPrompt, canEdit, chat]);

  const undo = async (runId: string, force = false) => {
    setUndoError(null);
    const r = await chat.undo(runId, force);
    if (r.ok) setConflict(null);
    else if (r.conflicts?.length) setConflict({ runId, blocks: r.conflicts });
    else setUndoError(r.message ?? "That could not be undone.");
  };
  const lastQuestions = chat.messages.findLast((m) => m.content.kind === "questions");
  const usable = canEdit && kind === "doc";

  return (
    <section className="ui-chat" aria-label="Chat">
      <div className="ui-panel-head">
        <IconSparkle /><strong className="ui-label">AI</strong>
        <span style={{ flex: 1 }} />
        {demo ? <Badge tone="guest">Demo AI</Badge> : null}
      </div>
      <div className="ui-msgs ui-chat-log" role="log" aria-live="polite" aria-label="Conversation">
        {demo ? <p className="ui-hint">This is a scripted stand-in with canned writing. A real model is connected in the backend step.</p> : null}
        {chat.messages.length === 0 && !chat.running ? (
          usable ? (
            <div className="ui-stack">
              <p className="ui-caption" style={{ margin: 0 }}>Say what you need and the draft appears in the page. You can keep typing in the page while it works.</p>
              {EXAMPLES.map((x) => <button key={x} className="ui-option" style={{ height: "auto", padding: "6px 12px", textAlign: "left", justifySelf: "start" }} onClick={() => chat.send(x)}>{x}</button>)}
            </div>
          ) : <p className="ui-caption" style={{ margin: 0 }}>{kind === "deck" ? "AI drafting for slides is built in the Slides milestone." : "You can read this document. The AI works for people who can edit it."}</p>
        ) : null}
        {chat.messages.map((m) => <Bubble key={m.id} m={m} live={!chat.running && m.id === lastQuestions?.id && m === chat.messages.at(-1)} onUndo={(id) => void undo(id)} onAnswer={chat.answer} />)}
        {chat.progress.map((p, i) => <ProgressLine key={i} label={p.label} done={p.done} />)}
        {chat.running && chat.streaming ? <ChatMessage role="ai" streaming>{chat.streaming}</ChatMessage> : null}
        {chat.running && !chat.streaming && chat.progress.every((p) => p.done) ? <ProgressLine label="Thinking" /> : null}
        {chat.failed ? <ChatMessage role="error" onRetry={chat.failed.retry}>{chat.failed.message}</ChatMessage> : null}
        {undoError ? <ChatMessage role="error">{undoError}</ChatMessage> : null}
        <div ref={end} />
      </div>
      <div className="ui-composer">
        <PromptBox placeholder={chat.messages.length ? "Ask for a change" : "What do you want to write?"} disabled={!usable} running={chat.running} onSubmit={(t) => chat.send(t)} onStop={chat.stop} />
      </div>
      <ControlledDialog open={!!conflict} onOpenChange={(o) => { if (!o) setConflict(null); }} title="This was edited since" description="Someone changed the text the AI wrote. Undoing will replace their version too.">
        <ul className="ui-caption" style={{ margin: "0 0 16px", paddingLeft: 18 }}>{conflict?.blocks.map((b) => <li key={b}>“{b}”</li>)}</ul>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={() => setConflict(null)}>Keep it</Button>
          <Button variant="danger" onClick={() => conflict && void undo(conflict.runId, true)}>Undo anyway</Button>
        </div>
      </ControlledDialog>
    </section>
  );
}
