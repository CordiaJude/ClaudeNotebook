/* The document schema, shared by the browser editor and the server (lib/doc/schema.ts builds a ProseMirror schema from it).
   No React and no DOM access here: node views are attached by the client. */
import { Extension, Node, mergeAttributes, type AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import UniqueID from "@tiptap/extension-unique-id";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Markdown } from "@tiptap/markdown";
import { common, createLowlight } from "lowlight";
import { BLOCK_ID_TYPES, isCellColor, isSafeHref } from "./constants";
import { slashExtension, type SlashState } from "./slash";

const lowlight = createLowlight(common);

/** A document is one title, then one or more blocks. */
export const Doc = Node.create({ name: "doc", topNode: true, content: "title block+" });

export const Title = Node.create({
  name: "title",
  content: "text*",
  marks: "",
  defining: true,
  addKeyboardShortcuts() {
    // Enter in the title moves to the body instead of splitting the (single) title.
    return {
      Enter: ({ editor }) => {
        const { doc, selection } = editor.state;
        if (selection.$from.parent.type.name !== "title") return false;
        return editor.chain().focus().setTextSelection(Math.min(doc.child(0).nodeSize + 1, doc.content.size - 1)).run();
      },
    };
  },
  parseHTML: () => [{ tag: "h1[data-title]" }],
  renderHTML: ({ HTMLAttributes }) => ["h1", mergeAttributes(HTMLAttributes, { "data-title": "" }), 0],
});

/** A section the AI has planned but not written yet. It shows what the section will say. A person can delete it. */
export const DraftSlot = Node.create({
  name: "draftSlot",
  group: "block",
  atom: true,
  addAttributes: () => ({
    intent: { default: "", parseHTML: (el: HTMLElement) => el.getAttribute("data-intent") ?? "", renderHTML: (a: Record<string, unknown>) => ({ "data-intent": String(a.intent ?? "") }) },
  }),
  parseHTML: () => [{ tag: "div[data-draft-slot]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-draft-slot": "" })],
});

const cellFill = {
  background: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => { const v = el.getAttribute("data-bg"); return isCellColor(v) ? v : null; },
    renderHTML: (attrs: Record<string, unknown>) => (isCellColor(attrs.background) ? { "data-bg": attrs.background, style: `background: var(--color-tint-${attrs.background})` } : {}),
  },
};
const Cell = TableCell.extend({ addAttributes() { return { ...this.parent?.(), ...cellFill }; } });
const HeaderCell = TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...cellFill }; } });

export type BuildOptions = {
  onSlash?: (s: SlashState | null) => void;
  /** Local undo history. Off when the document is live (Yjs keeps the history then). */
  history?: boolean;
  /** Lets the client attach a view to the draft slot and skip id assignment for remote changes. */
  draftSlot?: AnyExtension;
  isRemoteChange?: (tr: unknown) => boolean;
};

export function buildExtensions(opts: BuildOptions = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      document: false,
      undoRedo: opts.history ? {} : false,
      codeBlock: false,
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, isAllowedUri: (url, ctx) => ctx.defaultValidate(url) && isSafeHref(url), HTMLAttributes: { rel: "noopener noreferrer nofollow" } },
    }),
    Doc,
    Title,
    opts.draftSlot ?? DraftSlot,
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight,
    Table.configure({ resizable: true }),
    TableRow,
    HeaderCell,
    Cell,
    UniqueID.configure({ types: BLOCK_ID_TYPES, attributeName: "id", filterTransaction: (tr) => !(opts.isRemoteChange?.(tr) ?? false) }),
    Placeholder.configure({ placeholder: ({ node }) => (node.type.name === "title" ? "Untitled" : "Write, or type / to insert") }),
    Markdown,
    ...(opts.onSlash ? [slashExtension(opts.onSlash)] : []),
    Extension.create({
      name: "linkShortcut",
      addKeyboardShortcuts() {
        return {
          "Mod-k": () => {
            const prev = this.editor.getAttributes("link").href as string | undefined;
            const url = window.prompt("Link address", prev ?? "https://");
            if (url === null) return true;
            if (url === "") return this.editor.chain().focus().unsetLink().run();
            if (!isSafeHref(url)) return true;
            return this.editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          },
        };
      },
    }),
  ];
}
