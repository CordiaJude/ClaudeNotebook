import type { Editor, JSONContent } from "@tiptap/react";

/** Parse markdown into body blocks. Never insert markdown as a whole `doc`: the doc schema requires title + byline first. */
export function markdownToBlocks(editor: Editor, md: string): JSONContent[] {
  const parsed = (editor as unknown as { markdown: { parse: (s: string) => JSONContent } }).markdown.parse(md);
  return (parsed.content ?? []).filter((n) => n.type !== "title" && n.type !== "byline");
}

export function insertMarkdown(editor: Editor, md: string): boolean {
  const blocks = markdownToBlocks(editor, md);
  return blocks.length > 0 && editor.chain().focus().insertContent(blocks).run();
}
