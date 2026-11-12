import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";

export type SlashItem = { id: string; label: string; hint: string; keywords: string[]; run: (editor: Editor, range: Range) => void };
export type SlashState = { items: SlashItem[]; index: number; rect: DOMRect | null; select: (i: number) => void };

const code = (lang: string, text = "") => (editor: Editor, range: Range) =>
  editor.chain().focus().deleteRange(range).insertContent({ type: "codeBlock", attrs: { language: lang }, content: text ? [{ type: "text", text }] : undefined }).run();

export const SLASH_ITEMS: SlashItem[] = [
  { id: "h1", label: "Heading 1", hint: "Large section title", keywords: ["title", "h1"], run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 1 }).run() },
  { id: "h2", label: "Heading 2", hint: "Section heading", keywords: ["h2", "subtitle"], run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 2 }).run() },
  { id: "h3", label: "Heading 3", hint: "Small heading", keywords: ["h3"], run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 3 }).run() },
  { id: "bullet", label: "Bullet list", hint: "Unordered items", keywords: ["ul", "list"], run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { id: "ordered", label: "Numbered list", hint: "Ordered steps", keywords: ["ol", "list", "numbers"], run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { id: "task", label: "Task list", hint: "Checkable items", keywords: ["todo", "checkbox"], run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { id: "quote", label: "Quote", hint: "Blockquote", keywords: ["blockquote"], run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { id: "divider", label: "Divider", hint: "Horizontal rule", keywords: ["hr", "line"], run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
  { id: "table", label: "Table", hint: "Rows and columns", keywords: ["grid"], run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: "image", label: "Image", hint: "Upload a picture", keywords: ["photo", "upload"], run: (e, r) => { e.chain().focus().deleteRange(r).run(); window.dispatchEvent(new CustomEvent("cn:pick-image")); } },
  { id: "mention", label: "Mention person", hint: "@ someone in this notebook", keywords: ["at", "user", "people"], run: (e, r) => { e.chain().focus().deleteRange(r).run(); window.dispatchEvent(new CustomEvent("cn:insert-chip", { detail: { kind: "user" } })); } },
  { id: "tablink", label: "Link to tab", hint: "Chip pointing to another tab", keywords: ["tab", "mention"], run: (e, r) => { e.chain().focus().deleteRange(r).run(); window.dispatchEvent(new CustomEvent("cn:insert-chip", { detail: { kind: "tab" } })); } },
  { id: "nblink", label: "Link to notebook", hint: "Chip pointing to a notebook", keywords: ["notebook", "mention"], run: (e, r) => { e.chain().focus().deleteRange(r).run(); window.dispatchEvent(new CustomEvent("cn:insert-chip", { detail: { kind: "notebook" } })); } },
  { id: "date", label: "Date", hint: "A date someone may act on", keywords: ["deadline", "due"], run: (e, r) => { e.chain().focus().deleteRange(r).run(); window.dispatchEvent(new CustomEvent("cn:insert-chip", { detail: { kind: "date" } })); } },
  { id: "dropdown", label: "Dropdown", hint: "Status-style value from a list", keywords: ["status", "enum", "select"], run: (e, r) => { e.chain().focus().deleteRange(r).run(); window.dispatchEvent(new CustomEvent("cn:insert-chip", { detail: { kind: "dropdown" } })); } },
  { id: "code", label: "Code block", hint: "Syntax highlighted", keywords: ["snippet"], run: code("javascript") },
  { id: "latex", label: "Formula (LaTeX)", hint: "Rendered display math", keywords: ["math", "katex", "equation"], run: code("latex", "E = mc^2") },
  { id: "csv", label: "CSV data", hint: "Read-only grid", keywords: ["table", "data"], run: code("csv", "name,value\nA,1\nB,2") },
  { id: "markdown", label: "Markdown exhibit", hint: "Rendered markdown", keywords: ["md"], run: code("markdown", "**Bold** and a list:\n\n- one\n- two") },
  { id: "mermaid", label: "Mermaid diagram", hint: "Flowchart from text", keywords: ["diagram", "flow"], run: code("mermaid", "graph LR\n  A --> B") },
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
