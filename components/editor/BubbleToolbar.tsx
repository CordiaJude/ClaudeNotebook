"use client";
import { BubbleMenu } from "@tiptap/react/menus";
import { useEditorState, type Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { IconBold, IconItalic, IconLink, IconSparkle } from "@/components/ui/icons";

export function BubbleToolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({ b: e.isActive("bold"), i: e.isActive("italic"), u: e.isActive("underline"), st: e.isActive("strike"), c: e.isActive("code"), h: e.isActive("highlight"), l: e.isActive("link") }),
  });
  const t = (on: boolean) => ({ "aria-pressed": on, style: on ? { background: "var(--cn-surface-pressed)" } : undefined });
  return (
    <BubbleMenu editor={editor} options={{ placement: "top" }} shouldShow={({ editor: e, state }) => e.isEditable && !state.selection.empty && !("node" in state.selection) && !e.isActive("codeBlock")}>
      <div className="cn-toolbar" role="toolbar" aria-label="Formatting">
        <Button variant="icon" aria-label="Bold" {...t(s.b)} onClick={() => editor.chain().focus().toggleBold().run()}><IconBold /></Button>
        <Button variant="icon" aria-label="Italic" {...t(s.i)} onClick={() => editor.chain().focus().toggleItalic().run()}><IconItalic /></Button>
        <Button variant="icon" aria-label="Underline" {...t(s.u)} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></Button>
        <Button variant="icon" aria-label="Strikethrough" {...t(s.st)} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></Button>
        <Button variant="icon" aria-label="Inline code" {...t(s.c)} onClick={() => editor.chain().focus().toggleCode().run()}><span className="cn-code">{"</>"}</span></Button>
        <Button variant="icon" aria-label="Highlight" {...t(s.h)} onClick={() => editor.chain().focus().toggleHighlight().run()}><mark style={{ padding: "0 4px", background: "var(--cn-accent-tint)", color: "inherit" }}>H</mark></Button>
        <Button variant="icon" aria-label="Link" {...t(s.l)} onClick={() => editor.commands.focus() && document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}><IconLink /></Button>
        <Button variant="ghost" size="sm" aria-label="Ask Claude to edit the selection" onClick={() => { const { from, to } = editor.state.selection; window.dispatchEvent(new CustomEvent("cn:ask-claude", { detail: { text: editor.state.doc.textBetween(from, to, " ").slice(0, 2000) } })); }}><IconSparkle /> Ask Claude</Button>
      </div>
    </BubbleMenu>
  );
}
