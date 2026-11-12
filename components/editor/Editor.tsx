"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor as TiptapEditor, type JSONContent } from "@tiptap/react";
import { ClientSideSuspense, LiveblocksProvider, RoomProvider, useOthers } from "@liveblocks/react";
import { useLiveblocksExtension } from "@liveblocks/react-tiptap";
import { buildExtensions } from "@/lib/editor/extensions";
import { slugify } from "@/lib/editor/constants";
import { insertMarkdown } from "@/lib/editor/markdown";
import type { SlashState } from "@/lib/editor/slash";
import { createClient } from "@/lib/supabase/client";
import { AvatarStack } from "@/components/ui/misc";
import { Skeleton } from "@/components/ui/misc";
import { BubbleToolbar } from "./BubbleToolbar";
import { SlashMenu } from "./SlashMenu";
import { TableBar } from "./TableBar";
import { ChipPicker } from "./ChipPicker";
import { EnumManager } from "./EnumManager";
import { useNotebook } from "./context";

export type Role = "owner" | "editor" | "commenter" | "viewer";

function Presence() {
  const others = useOthers();
  const people = others.map((o) => ({ name: o.info?.name ?? "Someone" }));
  if (people.length === 0) return null;
  return <AvatarStack people={people.slice(0, 5)} />;
}

async function uploadImage(file: File, notebookId: string): Promise<{ blobId: string; url: string } | null> {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("notebookId", notebookId);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) { window.alert((await res.json().catch(() => ({}))).message ?? "Upload failed"); return null; }
  return res.json();
}

function EditorBody({ notebookId, role, initialContent, syncsTitle }: { notebookId: string; role: Role; initialContent: JSONContent; syncsTitle: boolean }) {
  const canEdit = role === "owner" || role === "editor";
  const { author } = useNotebook();
  const liveblocks = useLiveblocksExtension({ initialContent, comments: false, mentions: false });
  const [slash, setSlash] = useState<SlashState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const syncTitle = useCallback((e: TiptapEditor) => {
    clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(async () => {
      const first = e.state.doc.firstChild;
      const title = first?.type.name === "title" ? first.textContent.trim() : "";
      if (title) await createClient().from("notebooks").update({ title: title.slice(0, 200), updated_at: new Date().toISOString() }).eq("id", notebookId);
    }, 2000);
  }, [notebookId]);

  const insertImages = useCallback(async (files: File[], e: TiptapEditor) => {
    for (const f of files) {
      const up = await uploadImage(f, notebookId);
      if (up) e.chain().focus().setImage({ src: up.url, alt: f.name.replace(/\.[^.]+$/, "") }).updateAttributes("image", { blobId: up.blobId }).run();
    }
  }, [notebookId]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: canEdit,
    extensions: [liveblocks, ...buildExtensions({ onSlash: setSlash, getAuthor: () => author })],
    editorProps: {
      attributes: { class: "cn-prose", role: "textbox", "aria-multiline": "true", "aria-label": "Document" },
      handlePaste(view, event) {
        const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
        if (files.length) { event.preventDefault(); void insertImages(files, editorRef.current!); return true; }
        const types = event.clipboardData?.types ?? [];
        const text = event.clipboardData?.getData("text/plain") ?? "";
        const looksMd = /^(#{1,3} |[-*] |\d+\. |> |```)|\*\*[^*]+\*\*|^\|.+\|$/m.test(text);
        if (types.includes("text/plain") && !types.includes("text/html") && looksMd && !view.state.selection.$from.parent.type.spec.code) {
          event.preventDefault();
          insertMarkdown(editorRef.current!, text);
          return true;
        }
        return false; // HTML paste goes through the schema, which drops anything not in it
      },
      handleDrop(_v, event) {
        const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
        if (!files.length) return false;
        event.preventDefault();
        void insertImages(files, editorRef.current!);
        return true;
      },
      handleClick(_v, _p, event) {
        const a = (event.target as HTMLElement).closest("a");
        const href = a?.getAttribute("href");
        if (!a || !href) return false;
        if (href.startsWith("#")) {
          event.preventDefault();
          const el = [...document.querySelectorAll<HTMLElement>(".cn-prose h1,.cn-prose h2,.cn-prose h3")].find((h) => slugify(h.textContent ?? "") === href.slice(1));
          el?.scrollIntoView({ behavior: "smooth", block: "start" });
          return true;
        }
        if (event.metaKey || event.ctrlKey) { window.open(href, "_blank", "noopener,noreferrer"); return true; }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => { if (canEdit && syncsTitle) syncTitle(e); },
  });
  const editorRef = useRef<TiptapEditor | null>(null);
  useEffect(() => { editorRef.current = editor; }, [editor]);
  useEffect(() => { editor?.setEditable(canEdit); }, [editor, canEdit]);
  useEffect(() => {
    const open = () => fileRef.current?.click();
    window.addEventListener("cn:pick-image", open);
    return () => window.removeEventListener("cn:pick-image", open);
  }, []);
  useEffect(() => () => clearTimeout(titleTimer.current), []);

  if (!editor) return <Skeleton h={200} />;
  return (
    <>
      <div className="cn-editor-chrome">
        <TableBar editor={editor} />
        <EnumManager />
        <span style={{ flex: 1 }} />
        <Presence />
        {!canEdit ? <span className="cn-badge">{role === "commenter" ? "Comment only" : "View only"}</span> : null}
      </div>
      <div className="cn-doc"><EditorContent editor={editor} /></div>
      {canEdit ? <BubbleToolbar editor={editor} /> : null}
      <SlashMenu state={slash} />
      <ChipPicker editor={editor} />
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void insertImages([f], editor); e.target.value = ""; }} />
    </>
  );
}

export function NotebookEditor(props: { notebookId: string; room: string; role: Role; initialContent: JSONContent; syncsTitle: boolean }) {
  return (
    <LiveblocksProvider authEndpoint="/api/liveblocks-auth">
      <RoomProvider id={props.room}>
        <ClientSideSuspense fallback={<Skeleton h={240} />}>
          <EditorBody notebookId={props.notebookId} role={props.role} initialContent={props.initialContent} syncsTitle={props.syncsTitle} />
        </ClientSideSuspense>
      </RoomProvider>
    </LiveblocksProvider>
  );
}
