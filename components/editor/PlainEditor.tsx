"use client";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useState } from "react";
import { buildExtensions } from "@/lib/editor/extensions";
import { seedContent } from "@/lib/templates";
import type { SlashState } from "@/lib/editor/slash";
import { BubbleToolbar } from "./BubbleToolbar";
import { ChipPicker } from "./ChipPicker";
import { NotebookProvider, type EnumRow } from "./context";
import { SlashMenu } from "./SlashMenu";
import { TableBar } from "./TableBar";

const AUTHOR = { id: "u-test", name: "Test Author" };
const ENUMS: EnumRow[] = [{ id: "e-status", name: "Status", options: [{ name: "On track" }, { name: "At risk" }, { name: "Blocked" }, { name: "Old", removed: true }] }];

/** Single-user editor with a mock notebook context and no backend. Used for the style guide and tests; the real editor adds Liveblocks sync. */
export function PlainEditor() {
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [enums, setEnums] = useState(ENUMS);
  const ctx = useMemo(() => ({
    notebookId: "nb-test", canEdit: true, author: AUTHOR,
    members: [AUTHOR, { id: "u-priya", name: "Priya" }],
    tabs: [{ id: "t1", name: "Main" }, { id: "t2", name: "Sources" }],
    notebooks: [{ id: "nb-2", title: "Other notebook" }],
    enums, setEnums,
    openTab: (id: string) => { (window as unknown as { __opened: string }).__opened = id; },
  }), [enums]);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: buildExtensions({ onSlash: setSlash, history: true, getAuthor: () => AUTHOR }),
    content: seedContent("plan", AUTHOR),
    editorProps: { attributes: { class: "cn-prose", role: "textbox", "aria-multiline": "true", "aria-label": "Document" } },
  });
  useEffect(() => { (window as unknown as { __editor: unknown }).__editor = editor; }, [editor]);
  if (!editor) return null;
  return (
    <NotebookProvider value={ctx}>
      <div className="cn-paper" style={{ maxWidth: 880, margin: "0 auto" }}>
        <div className="cn-editor-chrome"><TableBar editor={editor} /></div>
        <div className="cn-doc"><EditorContent editor={editor} /></div>
        <BubbleToolbar editor={editor} />
        <SlashMenu state={slash} />
        <ChipPicker editor={editor} />
      </div>
    </NotebookProvider>
  );
}
