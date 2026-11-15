"use client";
/* S05: the document editor. A live Yjs document bound to Tiptap, with the toolbar, the selection menu,
   "Edit with AI", the slash menu and the table bar. Read-only for viewers and commenters. */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState, type Editor, type NodeViewProps } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { redo, undo, ySyncPlugin, ySyncPluginKey, yUndoPlugin } from "y-prosemirror";
import type * as Y from "yjs";
import { AiEditComposer, Banner, PendingBlock, ReadOnlyBanner } from "@/components/doc/parts";
import { Button } from "@/components/ui/button";
import { IconAlert, IconBold, IconComment, IconItalic, IconLink, IconList, IconListOrdered, IconSparkle, IconTable, IconUnderline } from "@/components/ui/icons";
import { Menu, Popover } from "@/components/ui/overlays";
import { Skeleton } from "@/components/ui/misc";
import { scopeOf, type Scope } from "@/lib/doc/scope";
import { FIELD } from "@/lib/doc/ydoc";
import type { Message, Role } from "@/lib/data/types";
import { CELL_COLORS } from "@/lib/editor/constants";
import { DraftSlot, buildExtensions } from "@/lib/editor/extensions";
import type { SlashState } from "@/lib/editor/slash";
import { connectRoom, type RoomStatus } from "@/lib/rooms/client";
import { useChat } from "./chat-store";

function SlotView({ node }: NodeViewProps) {
  return <NodeViewWrapper contentEditable={false}><PendingBlock intent={String(node.attrs.intent ?? "")} /></NodeViewWrapper>;
}
const LiveSlot = DraftSlot.extend({ addNodeView() { return ReactNodeViewRenderer(SlotView); } });

/** Keeps the range being rewritten visible while the person types an instruction (the editor loses focus then). */
const pinKey = new PluginKey<DecorationSet>("aiPin");
const pinPlugin = new Plugin<DecorationSet>({
  key: pinKey,
  state: {
    init: () => DecorationSet.empty,
    apply(tr, set) {
      const m = tr.getMeta(pinKey) as { from: number; to: number } | null | undefined;
      if (m === undefined) return set.map(tr.mapping, tr.doc);
      return m ? DecorationSet.create(tr.doc, [Decoration.inline(m.from, m.to, { class: "ui-ai-mark" })]) : DecorationSet.empty;
    },
  },
  props: { decorations: (state) => pinKey.getState(state) },
});

function SlashList({ state }: { state: SlashState | null }) {
  if (!state || state.items.length === 0 || !state.rect) return null;
  const top = Math.min(state.rect.bottom + 6, window.innerHeight - 320), left = Math.min(state.rect.left, window.innerWidth - 260);
  return (
    <div className="ui-pop" role="listbox" aria-label="Insert" style={{ position: "fixed", top, left, width: 248, maxHeight: 300, overflowY: "auto" }}>
      {state.items.map((it, i) => (
        <div key={it.id} role="option" aria-selected={i === state.index} className="ui-item" data-highlighted={i === state.index ? "" : undefined} onMouseDown={(e) => { e.preventDefault(); state.select(i); }}>
          <span style={{ display: "grid" }}><span>{it.label}</span><span className="ui-card-meta">{it.hint}</span></span>
        </div>
      ))}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({ editor, selector: ({ editor: e }) => ({ b: e.isActive("bold"), i: e.isActive("italic"), u: e.isActive("underline"), l: e.isActive("link"), ul: e.isActive("bulletList"), ol: e.isActive("orderedList"), level: [1, 2, 3].find((n) => e.isActive("heading", { level: n })) ?? 0, inTable: e.isActive("table"), inTitle: e.state.selection.$from.parent.type.name === "title", bg: (e.getAttributes("tableCell").background ?? e.getAttributes("tableHeader").background ?? null) as string | null }) });
  const c = () => editor.chain().focus();
  const off = s.inTitle;
  const btn = (label: string, on: boolean, run: () => void, icon: React.ReactNode) => <Button variant="icon" aria-label={label} aria-pressed={on} disabled={off} onClick={run}>{icon}</Button>;
  return (
    <div className="ui-toolbar ui-toolbar--flat ui-doc-toolbar" role="toolbar" aria-label="Formatting">
      <Menu trigger={<Button variant="ghost" size="sm" disabled={off} aria-label="Text style">{s.level ? `Heading ${s.level}` : "Text"} <span aria-hidden style={{ fontSize: 10, opacity: 0.7 }}>▾</span></Button>}
        items={[{ label: "Text", onSelect: () => c().setParagraph().run() }, ...[1, 2, 3].map((n) => ({ label: `Heading ${n}`, onSelect: () => c().setHeading({ level: n as 1 | 2 | 3 }).run() }))]} />
      <span className="ui-toolbar-sep" aria-hidden />
      {btn("Bold", s.b, () => c().toggleBold().run(), <IconBold />)}
      {btn("Italic", s.i, () => c().toggleItalic().run(), <IconItalic />)}
      {btn("Underline", s.u, () => c().toggleUnderline().run(), <IconUnderline />)}
      {btn("Link", s.l, () => { editor.commands.focus(); editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })); }, <IconLink />)}
      <span className="ui-toolbar-sep" aria-hidden />
      {btn("Bullet list", s.ul, () => c().toggleBulletList().run(), <IconList />)}
      {btn("Numbered list", s.ol, () => c().toggleOrderedList().run(), <IconListOrdered />)}
      {btn("Insert table", false, () => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), <IconTable />)}
      {s.inTable ? (
        <>
          <span className="ui-toolbar-sep" aria-hidden />
          <Menu trigger={<Button variant="ghost" size="sm">Table <span aria-hidden style={{ fontSize: 10, opacity: 0.7 }}>▾</span></Button>} items={[
            { label: "Add row below", onSelect: () => c().addRowAfter().run() }, { label: "Add column right", onSelect: () => c().addColumnAfter().run() },
            { label: "Header row on or off", onSelect: () => c().toggleHeaderRow().run() }, "sep",
            { label: "Delete row", onSelect: () => c().deleteRow().run() }, { label: "Delete column", onSelect: () => c().deleteColumn().run() }, { label: "Delete table", onSelect: () => c().deleteTable().run() },
          ]} />
          <Popover trigger={<Button variant="ghost" size="sm">Cell colour</Button>}>
            <div className="ui-swatches" role="group" aria-label="Cell colour">
              {CELL_COLORS.map((col) => <button key={col} className="ui-swatch" aria-label={col} aria-pressed={s.bg === col} style={{ background: `var(--color-tint-${col})` }} onClick={() => c().setCellAttribute("background", s.bg === col ? null : col).run()} />)}
            </div>
          </Popover>
        </>
      ) : null}
    </div>
  );
}

type AiEdit = { scope: Scope; top: number; left: number; busy: boolean; error?: string };

function LiveEditor({ ydoc, artifactId, role, kindOk }: { ydoc: Y.Doc; artifactId: string; role: Role; kindOk: boolean }) {
  const editable = role === "owner" || role === "editor";
  const chat = useChat();
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [ai, setAi] = useState<AiEdit | null>(null);
  const request = useRef<AbortController | null>(null);

  const live = useMemo(() => Extension.create({
    name: "liveDocument",
    addProseMirrorPlugins: () => [ySyncPlugin(ydoc.getXmlFragment(FIELD)), yUndoPlugin(), pinPlugin],
    addKeyboardShortcuts() { return { "Mod-z": () => undo(this.editor.state), "Mod-y": () => redo(this.editor.state), "Shift-Mod-z": () => redo(this.editor.state) }; },
  }), [ydoc]);

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [live, ...buildExtensions({ onSlash: setSlash, draftSlot: LiveSlot, isRemoteChange: (tr) => !!(tr as { getMeta(k: unknown): { isChangeOrigin?: boolean } | undefined }).getMeta(ySyncPluginKey)?.isChangeOrigin })],
    editorProps: { attributes: { class: "ui-prose", role: "textbox", "aria-multiline": "true", "aria-label": "Document", ...(editable ? {} : { "aria-readonly": "true" }) } },
  }, [live]);
  useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);

  const blank = useEditorState({ editor, selector: ({ editor: e }) => !!e && e.state.doc.childCount === 2 && e.state.doc.child(1).content.size === 0 && e.state.doc.child(0).content.size === 0 });

  const closeAi = useCallback((refocus = true) => {
    request.current?.abort(); request.current = null;
    setAi(null);
    if (editor && !editor.isDestroyed) { editor.view.dispatch(editor.state.tr.setMeta(pinKey, null)); if (refocus) editor.commands.focus(); }
  }, [editor]);

  const openAi = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const scope = scopeOf(editor.state.doc, from, to);
    if (!scope) return;
    const box = editor.view.coordsAtPos(to), start = editor.view.coordsAtPos(from);
    editor.view.dispatch(editor.state.tr.setMeta(pinKey, { from, to }));
    setAi({ scope, busy: false, top: Math.min(box.bottom + 8, window.innerHeight - 220), left: Math.max(12, Math.min(start.left, window.innerWidth - 384)) });
  };

  const submitAi = async (instruction: string) => {
    if (!ai) return;
    const ctl = new AbortController();
    request.current = ctl;
    setAi({ ...ai, busy: true, error: undefined });
    try {
      const res = await fetch("/api/ai/runs", { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal, body: JSON.stringify({ mode: "selection", artifactId, scope: ai.scope, instruction }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; messages?: Message[] };
      if (res.ok && j.ok) { chat.append(j.messages ?? []); closeAi(); return; }
      setAi((cur) => (cur ? { ...cur, busy: false, error: j.message ?? "That did not go through. Try again." } : cur));
    } catch {
      if (!ctl.signal.aborted) setAi((cur) => (cur ? { ...cur, busy: false, error: "The connection dropped. Nothing was changed." } : cur));
    }
  };
  useEffect(() => {
    if (!ai) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeAi(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ai, closeAi]);

  if (!editor) return <Skeleton h={240} />;
  return (
    <>
      {editable ? <Toolbar editor={editor} /> : <ReadOnlyBanner role={role === "commenter" ? "commenter" : "viewer"} />}
      <div className="ui-doc"><EditorContent editor={editor} /></div>
      {editable && blank && !chat.running ? <p className="ui-caption ui-doc-hint">An empty page. Ask the AI for a first draft in the chat, or start typing.</p> : null}
      {editable ? (
        <BubbleMenu editor={editor} options={{ placement: "top" }} shouldShow={({ editor: e, state }) => !ai && e.isEditable && !state.selection.empty && !("node" in state.selection) && state.selection.$from.parent.type.name !== "title" && !e.isActive("codeBlock")}>
          <div className="ui-toolbar" role="toolbar" aria-label="Selection">
            {kindOk ? <><Button variant="ghost" size="sm" onClick={openAi}><IconSparkle /> Edit with AI</Button><span className="ui-toolbar-sep" aria-hidden /></> : null}
            <Button variant="icon" aria-label="Bold" aria-pressed={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><IconBold /></Button>
            <Button variant="icon" aria-label="Italic" aria-pressed={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><IconItalic /></Button>
            <Button variant="icon" aria-label="Link" aria-pressed={editor.isActive("link")} onClick={() => { editor.commands.focus(); editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })); }}><IconLink /></Button>
            <Button variant="icon" aria-label="Comment (built in a later milestone)" disabled><IconComment /></Button>
          </div>
        </BubbleMenu>
      ) : null}
      {ai ? (
        <div style={{ position: "fixed", top: ai.top, left: ai.left, zIndex: 45 }}>
          <AiEditComposer quote={ai.scope.text.replace(/\s+/g, " ")} busy={ai.busy} error={ai.error} onSubmit={(t) => void submitAi(t)} onCancel={() => closeAi()} />
        </div>
      ) : null}
      <SlashList state={slash} />
    </>
  );
}

export function DocEditor({ room, artifactId, role, onStatus, onSaving }: { room: string; artifactId: string; role: Role; onStatus?: (s: RoomStatus) => void; onSaving?: (pending: boolean) => void }) {
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [status, setStatus] = useState<RoomStatus>("connecting");
  const canWrite = role === "owner" || role === "editor";
  useEffect(() => {
    let alive = true;
    const conn = connectRoom(room, { canWrite, onStatus: (s) => { if (alive) { setStatus(s); onStatus?.(s); } }, onSaving: (p) => { if (alive) onSaving?.(p); } });
    void conn.synced.then(() => { if (alive) setYdoc(conn.ydoc); });
    return () => { alive = false; setYdoc(null); conn.destroy(); };
  }, [room, canWrite, onStatus, onSaving]);

  if (status === "revoked") return <Banner tone="error" icon={<IconAlert />} action={<Button asChild variant="ghost" size="sm"><Link href="/library">Library</Link></Button>}>Your access to this document was removed.</Banner>;
  if (status === "failed") return <Banner tone="error" icon={<IconAlert />} action={<Button variant="ghost" size="sm" onClick={() => window.location.reload()}>Reload</Button>}>This document could not be opened. Check your connection, then reload.</Banner>;
  return (
    <>
      {status === "reconnecting" ? <Banner tone="warning">Reconnecting. Your edits are kept and will be saved.</Banner> : null}
      {ydoc ? <LiveEditor ydoc={ydoc} artifactId={artifactId} role={role} kindOk /> : <div className="ui-stack" aria-busy="true" aria-label="Opening the document"><Skeleton w="60%" h={36} /><Skeleton /><Skeleton w="92%" /><Skeleton w="78%" /></div>}
    </>
  );
}
