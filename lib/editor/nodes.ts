import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { BylineView, DateChipView, DropdownChipView, EmbedView, MentionChipView, PendingView } from "@/components/editor/NodeViews";

/** Every tab body: title, byline, then one or more blocks (spec §7 invariants). */
export const Doc = Node.create({ name: "doc", topNode: true, content: "title byline block+" });

export const Title = Node.create({
  name: "title",
  content: "text*",
  marks: "",
  defining: true,
  addKeyboardShortcuts() {
    // Enter in the title jumps to the body instead of splitting the (unique) title.
    return {
      Enter: ({ editor }) => {
        const { doc, selection } = editor.state;
        if (selection.$from.parent.type.name !== "title") return false;
        const bodyStart = doc.child(0).nodeSize + (doc.child(1)?.nodeSize ?? 0) + 1;
        return editor.chain().focus().setTextSelection(Math.min(bodyStart, doc.content.size - 1)).run();
      },
    };
  },
  parseHTML: () => [{ tag: "h1[data-title]" }],
  renderHTML: ({ HTMLAttributes }) => ["h1", mergeAttributes(HTMLAttributes, { "data-title": "" }), 0],
});

const str = (name: string) => ({ default: null as string | null, parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`), renderHTML: (a: Record<string, unknown>) => (a[name] ? { [`data-${name}`]: String(a[name]) } : {}) });

export const Byline = Node.create<{ getAuthor: () => { id: string; name: string } | null }>({
  name: "byline",
  group: "", // only reachable through the doc content expression: exactly one, right after the title
  atom: true,
  selectable: false,
  addOptions: () => ({ getAuthor: () => null }),
  addAttributes: () => ({ asof: str("asof"), authorId: str("author-id"), authorName: str("author-name") }),
  parseHTML: () => [{ tag: "div[data-byline]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-byline": "" })],
  addNodeView: () => ReactNodeViewRenderer(BylineView),
  addProseMirrorPlugins() {
    const getAuthor = this.options.getAuthor;
    return [
      new Plugin({
        // A byline created by the schema filler (e.g. after select-all + delete) has no date/author: fill it.
        appendTransaction(_trs, _old, state) {
          const a = getAuthor();
          let tr = null as ReturnType<typeof state.tr.setNodeMarkup> | null;
          state.doc.forEach((node, pos) => {
            if (node.type.name === "byline" && (!node.attrs.asof || !node.attrs.authorId) && a) {
              tr = (tr ?? state.tr).setNodeMarkup(pos, undefined, { asof: node.attrs.asof ?? new Date().toISOString().slice(0, 10), authorId: node.attrs.authorId ?? a.id, authorName: node.attrs.authorName ?? a.name });
            }
          });
          return tr;
        },
      }),
    ];
  },
});

const chip = (name: string, attrs: Record<string, { default: unknown }>, view: Parameters<typeof ReactNodeViewRenderer>[0], text: (a: Record<string, unknown>) => string) =>
  Node.create({
    name,
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,
    addAttributes: () => Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, { ...v, parseHTML: (el: HTMLElement) => el.getAttribute(`data-${k.toLowerCase()}`), renderHTML: (a: Record<string, unknown>) => (a[k] != null ? { [`data-${k.toLowerCase()}`]: String(a[k]) } : {}) }])),
    parseHTML: () => [{ tag: `span[data-chip="${name}"]` }],
    renderHTML: ({ node, HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { "data-chip": name }), text(node.attrs)],
    addNodeView: () => ReactNodeViewRenderer(view),
  });

export const MentionChip = chip("mentionChip", { kind: { default: "user" }, ref: { default: null }, label: { default: "" } }, MentionChipView, (a) => `${a.kind === "user" ? "@" : ""}${a.label ?? ""}`);
export const DateChip = chip("dateChip", { value: { default: null } }, DateChipView, (a) => String(a.value ?? ""));
export const DropdownChip = chip("dropdownChip", { enumId: { default: null }, index: { default: null } }, DropdownChipView, () => "▾");

/** Agent-created placeholder for a section it will fill. A human can delete it; the agent must not recreate it. */
export const Pending = Node.create({
  name: "pending",
  group: "block",
  atom: true,
  addAttributes: () => ({ intent: { default: "", parseHTML: (el: HTMLElement) => el.getAttribute("data-intent") ?? "", renderHTML: (a: Record<string, unknown>) => ({ "data-intent": String(a.intent ?? "") }) } }),
  parseHTML: () => [{ tag: "div[data-pending]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-pending": "" })],
  addNodeView: () => ReactNodeViewRenderer(PendingView),
});

/** Chart/diagram widget, alone on its line. Rendering lands in Phase 7; Phase 3 keeps the node + caption. */
export const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  addAttributes: () => ({ widgetId: str("widget-id"), caption: { default: "", parseHTML: (el: HTMLElement) => el.getAttribute("data-caption") ?? "", renderHTML: (a: Record<string, unknown>) => ({ "data-caption": String(a.caption ?? "") }) } }),
  parseHTML: () => [{ tag: "div[data-embed]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-embed": "" })],
  addNodeView: () => ReactNodeViewRenderer(EmbedView),
});
