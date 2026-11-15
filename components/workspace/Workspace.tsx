"use client";
/* S04: chat on one side, the document on the other, a handle between them. On a phone they stack behind a switch. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { renameArtifact } from "@/app/actions";
import { Mark } from "@/components/brand/Mark";
import { AiPresencePill, EmptyState } from "@/components/doc/parts";
import { Button } from "@/components/ui/button";
import { IconDeck, IconDownload, IconPeople } from "@/components/ui/icons";
import { Badge, Segmented } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/overlays";
import type { Artifact, Message, Tab } from "@/lib/data/types";
import type { RoomStatus } from "@/lib/rooms/client";
import { Chat } from "./Chat";
import { ChatProvider, useChat } from "./chat-store";
import { DocEditor } from "./DocEditor";

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

export function Workspace({ artifact, tab, messages, demo, firstPrompt }: { artifact: Artifact; tab: Tab | null; messages: Message[]; demo: boolean; firstPrompt?: string }) {
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

  const state = !tab ? null : status === "reconnecting" ? "Reconnecting" : status === "connecting" ? "Opening" : !canEdit ? null : saving ? "Saving" : "Saved";
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
          <Tooltip label="Sharing is built in the next milestone"><Button variant="secondary" size="sm" aria-disabled="true" onClick={(e) => e.preventDefault()}><IconPeople /> <span className="ui-ws-wide">Share</span></Button></Tooltip>
          <Tooltip label="Export is built in the next milestone"><Button variant="secondary" size="sm" aria-disabled="true" onClick={(e) => e.preventDefault()}><IconDownload /> <span className="ui-ws-wide">Export</span></Button></Tooltip>
        </header>
        <div className="ui-ws-main">
          <div className="ui-ws-chat"><Chat canEdit={canEdit} demo={demo} kind={artifact.kind} firstPrompt={firstPrompt} /></div>
          <div className="ui-ws-handle" role="separator" aria-orientation="vertical" aria-label="Resize the chat" aria-valuemin={MIN} aria-valuemax={MAX} aria-valuenow={width} tabIndex={0}
            onKeyDown={(e) => { if (e.key === "ArrowLeft") resize(width - 24); if (e.key === "ArrowRight") resize(width + 24); }}
            onPointerDown={(e) => { drag.current = { x: e.clientX, w: width }; e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={(e) => { if (drag.current) resize(drag.current.w + e.clientX - drag.current.x); }}
            onPointerUp={() => { drag.current = null; }} />
          <main className="ui-ws-doc">
            <div className="ui-paper ui-ws-paper">
              {tab && artifact.kind === "doc"
                ? <DocEditor room={tab.room} artifactId={artifact.id} role={artifact.role} onStatus={onStatus} onSaving={onSaving} />
                : <EmptyState icon={<IconDeck />} title="The slide editor is not built yet" body="Decks can be created and listed. Editing, presenting and AI drafting for slides arrive in the Slides milestone." action={<Button asChild variant="secondary"><Link href="/library">Back to the library</Link></Button>} />}
            </div>
          </main>
        </div>
      </div>
    </ChatProvider>
  );
}
