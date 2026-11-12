"use client";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useState } from "react";
import { buildExtensions } from "@/lib/editor/extensions";
import { templateByKey } from "@/lib/templates";
import type { SlashState } from "@/lib/editor/slash";
import { BubbleToolbar } from "./BubbleToolbar";
import { SlashMenu } from "./SlashMenu";
import { TableBar } from "./TableBar";

/** Single-user editor with no backend. Used for the style guide and tests; the real editor adds Liveblocks sync. */
export function PlainEditor() {
  const [slash, setSlash] = useState<SlashState | null>(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: buildExtensions({ onSlash: setSlash, history: true }),
    content: templateByKey("plan").content,
    editorProps: { attributes: { class: "cn-prose", role: "textbox", "aria-multiline": "true", "aria-label": "Document" } },
  });
  useEffect(() => { (window as unknown as { __editor: unknown }).__editor = editor; }, [editor]);
  if (!editor) return null;
  return (
    <div className="cn-paper" style={{ maxWidth: 880, margin: "0 auto" }}>
      <div className="cn-editor-chrome"><TableBar editor={editor} /></div>
      <div className="cn-doc"><EditorContent editor={editor} /></div>
      <BubbleToolbar editor={editor} />
      <SlashMenu state={slash} />
    </div>
  );
}
