import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";

export type SlashItem = { id: string; label: string; hint: string; keywords: string[]; run: (editor: Editor, range: Range) => void };
export type SlashState = { items: SlashItem[]; index: number; rect: DOMRect | null; select: (i: number) => void };

export const SLASH_ITEMS: SlashItem[] = [
  { id: "h1", label: "Heading 1", hint: "Big section heading", keywords: ["title", "h1"], run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 1 }).run() },
  { id: "h2", label: "Heading 2", hint: "Section heading", keywords: ["h2", "subtitle"], run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 2 }).run() },
  { id: "h3", label: "Heading 3", hint: "Small heading", keywords: ["h3"], run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 3 }).run() },
  { id: "bullet", label: "Bullet list", hint: "A list of points", keywords: ["ul", "list"], run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { id: "ordered", label: "Numbered list", hint: "Steps in order", keywords: ["ol", "list", "numbers"], run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { id: "task", label: "Checklist", hint: "Items to tick off", keywords: ["todo", "checkbox", "task"], run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { id: "table", label: "Table", hint: "Rows and columns", keywords: ["grid"], run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: "quote", label: "Quote", hint: "Set a passage apart", keywords: ["blockquote"], run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { id: "divider", label: "Divider", hint: "A line between sections", keywords: ["hr", "line", "rule"], run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
  { id: "code", label: "Code", hint: "Monospaced block", keywords: ["snippet"], run: (e, r) => e.chain().focus().deleteRange(r).setNode("codeBlock").run() },
];

export const filterSlash = (q: string) => {
  const s = q.toLowerCase().trim();
  return SLASH_ITEMS.filter((i) => !s || i.label.toLowerCase().includes(s) || i.keywords.some((k) => k.includes(s)));
};

export function slashExtension(onState: (s: SlashState | null) => void) {
  return Extension.create({
    name: "slashCommand",
    addProseMirrorPlugins() {
      let items: SlashItem[] = [];
      let index = 0;
      let rect: DOMRect | null = null;
      let command: ((i: SlashItem) => void) | null = null;
      const push = () => onState({ items, index, rect, select: (i) => items[i] && command?.(items[i]) });
      return [
        Suggestion<SlashItem>({
          editor: this.editor,
          char: "/",
          allowSpaces: false,
          items: ({ query }) => filterSlash(query),
          command: ({ editor, range, props }) => props.run(editor, range),
          render: () => ({
            onStart: (p) => { items = p.items; index = 0; command = p.command; rect = p.clientRect?.() ?? null; push(); },
            onUpdate: (p) => { items = p.items; index = Math.min(index, Math.max(0, items.length - 1)); command = p.command; rect = p.clientRect?.() ?? null; push(); },
            onKeyDown: ({ event }) => {
              if (items.length === 0) return false;
              if (event.key === "ArrowDown") { index = (index + 1) % items.length; push(); return true; }
              if (event.key === "ArrowUp") { index = (index - 1 + items.length) % items.length; push(); return true; }
              if (event.key === "Enter" || event.key === "Tab") { const it = items[index]; if (it) command?.(it); return true; }
              return false;
            },
            onExit: () => onState(null),
          }),
        }),
      ];
    },
  });
}
