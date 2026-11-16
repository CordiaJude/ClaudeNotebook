"use client";
/* S04: chat on one side, the document on the other, a handle between them. On a phone they stack behind a switch. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { renameArtifact } from "@/app/actions";
import { Mark } from "@/components/brand/Mark";
import { DeckEditor } from "@/components/deck/DeckEditor";
import { AiPresencePill } from "@/components/doc/parts";
import { Button } from "@/components/ui/button";
import { IconPlay } from "@/components/ui/icons";
import { Badge, Segmented } from "@/components/ui/misc";
import type { Artifact, Message, Tab, User } from "@/lib/data/types";
import type { DesignSystem } from "@/lib/deck/design";
import type { RoomStatus } from "@/lib/rooms/client";
import { Chat } from "./Chat";
import { ChatProvider, useChat } from "./chat-store";
import { DocEditor } from "./DocEditor";
import { ExportButton } from "./Export";
import { ShareButton } from "./Share";

const MIN = 300, MAX = 560, KEY = "chat-width";

/** Shown in the top bar while the AI is changing the document. */
function Working() {
  const chat = useChat();
  return chat.running ? <AiPresencePill section={chat.section ?? "thinking"} /> : null;
}

function Title({ artifact }: { artifact: Artifact }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owner = artifact.role === "owner";
  if (!editing) {
    return owner
      ? <button className="ui-ws-title" title="Rename" onClick={() => setEditing(true)}>{artifact.title}</button>
      : <span className="ui-ws-title" aria-label={`${artifact.title}. Only the owner can rename it.`}>{artifact.title}</span>;
  }
  const save = async (value: string) => {
    const next = value.trim();
    if (!next || next === artifact.title) { setEditing(false); return; }
    const res = await renameArtifact(artifact.id, next);
    if (res?.error) { setError(res.error); return; }
    setEditing(false); setError(null); router.refresh();
  };
  return (
    <form className="ui-ws-rename" onSubmit={(e) => { e.preventDefault(); void save(new FormData(e.currentTarget).get("title") as string); }}>
      <input name="title" className="ui-field" aria-label="Name" defaultValue={artifact.title} maxLength={200} autoFocus aria-invalid={error ? true : undefined}
        onBlur={(e) => void save(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Escape") { setEditing(false); setError(null); } }} />
      {error ? <span className="ui-error" role="alert">{error}</span> : null}
    </form>
  );
}

export function Workspace({ artifact, tab, messages, demo, firstPrompt, me, design }: { artifact: Artifact; tab: Tab | null; messages: Message[]; demo: "no-key" | "public-demo" | null; firstPrompt?: string; me: User; design: DesignSystem }) {
  const router = useRouter();
  const canEdit = artifact.role === "owner" || artifact.role === "editor";
  const [width, setWidth] = useState(380);
  const [pane, setPane] = useState<"chat" | "doc">(firstPrompt ? "chat" : "doc");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<RoomStatus>("connecting");
  const drag = useRef<{ x: number; w: number } | null>(null);

  // The saved width is applied after the first paint, so the server and the browser render the same markup.
  useEffect(() => { const id = requestAnimationFrame(() => { try { const w = Number(localStorage.getItem(KEY)); if (w >= MIN && w <= MAX) setWidth(w); } catch { /* private mode */ } }); return () => cancelAnimationFrame(id); }, []);
  const resize = useCallback((w: number) => { const next = Math.max(MIN, Math.min(MAX, Math.round(w))); setWidth(next); try { localStorage.setItem(KEY, String(next)); } catch { /* private mode */ } }, []);
  // The first prompt travels in the address once; drop it so a reload does not send it again.
  useEffect(() => { if (firstPrompt) router.replace(`/a/${artifact.id}`, { scroll: false }); }, [firstPrompt, artifact.id, router]);
  const settled = useCallback(() => router.refresh(), [router]);
  const onStatus = useCallback((s: RoomStatus) => setStatus(s), []);
  const onSaving = useCallback((p: boolean) => setSaving(p), []);

  const state = !tab || status === "revoked" || status === "failed" ? null : status === "reconnecting" ? "Reconnecting" : status === "connecting" ? "Opening" : !canEdit ? null : saving ? "Saving" : "Saved";
  return (
    <ChatProvider artifactId={artifact.id} initial={messages} onSettled={settled}>
      <div className="ui-ws" data-pane={pane} style={{ ["--chat-width" as string]: `${width}px` }}>
        <header className="ui-ws-top">
          <Link href="/library" className="ui-btn ui-btn--ghost ui-btn--sm" aria-label="Back to the library"><Mark size={18} /> <span className="ui-ws-wide">Library</span></Link>
          <Title artifact={artifact} />
          {artifact.role !== "owner" ? <Badge>{artifact.role === "editor" ? "Can edit" : artifact.role === "commenter" ? "Can comment" : "View only"}</Badge> : null}
          {state ? <span className="ui-card-meta ui-ws-wide" role="status" aria-live="polite">{state}</span> : null}
          <span className="ui-ws-wide"><Working /></span>
          <span style={{ flex: 1 }} />
          <div className="ui-ws-switch"><Segmented label="Show" value={pane} onValueChange={setPane} options={[{ value: "chat", label: "Chat" }, { value: "doc", label: artifact.kind === "doc" ? "Doc" : "Slides" }]} /></div>
          <ShareButton artifact={artifact} myEmail={me.email} />
          {artifact.kind === "deck" ? (
            // Full screen has to be asked for inside the click itself; the page change keeps it.
            <Button variant="secondary" size="sm" aria-label="Present" onClick={() => { void document.documentElement.requestFullscreen?.().catch(() => {}); router.push(`/a/${artifact.id}/present`); }}><IconPlay /> <span className="ui-ws-wide">Present</span></Button>
          ) : null}
          <ExportButton artifactId={artifact.id} kind={artifact.kind} />
        </header>
        <div className="ui-ws-main">
          <div className="ui-ws-chat"><Chat canEdit={canEdit} demo={demo} kind={artifact.kind} firstPrompt={firstPrompt} /></div>
          <div className="ui-ws-handle" role="separator" aria-orientation="vertical" aria-label="Resize the chat" aria-valuemin={MIN} aria-valuemax={MAX} aria-valuenow={width} tabIndex={0}
            onKeyDown={(e) => { if (e.key === "ArrowLeft") resize(width - 24); if (e.key === "ArrowRight") resize(width + 24); }}
            onPointerDown={(e) => { drag.current = { x: e.clientX, w: width }; e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={(e) => { if (drag.current) resize(drag.current.w + e.clientX - drag.current.x); }}
            onPointerUp={() => { drag.current = null; }} />
          <main className={artifact.kind === "deck" ? "ui-ws-doc ui-ws-doc--deck" : "ui-ws-doc"}>
            {tab && artifact.kind === "deck"
              ? <DeckEditor room={tab.room} role={artifact.role} design={design} onStatus={onStatus} onSaving={onSaving} />
              : tab ? <div className="ui-paper ui-ws-paper"><DocEditor room={tab.room} artifactId={artifact.id} role={artifact.role} onStatus={onStatus} onSaving={onSaving} /></div> : null}
          </main>
        </div>
      </div>
    </ChatProvider>
  );
}
