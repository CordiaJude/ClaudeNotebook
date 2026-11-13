import { Extension, type AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import UniqueID from "@tiptap/extension-unique-id";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Markdown } from "@tiptap/markdown";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { common, createLowlight } from "lowlight";
import { CodeBlockView } from "@/components/editor/CodeBlockView";
import { isCellColor, isSafeHref } from "./constants";
import { slashExtension, type SlashState } from "./slash";
import { Byline, CommentMark, DateChip, Doc, DropdownChip, Embed, MentionChip, Pending, Title } from "./nodes";

const lowlight = createLowlight(common);

const bgAttr = {
  background: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => {
      const v = el.getAttribute("data-bg");
      return isCellColor(v) ? v : null;
    },
    renderHTML: (attrs: Record<string, unknown>) =>
      isCellColor(attrs.background) ? { "data-bg": attrs.background, style: `background: var(--cn-cell-${attrs.background})` } : {},
  },
};
const CellWithBg = TableCell.extend({ addAttributes() { return { ...this.parent?.(), ...bgAttr }; } });
const HeaderWithBg = TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...bgAttr }; } });

/** Images are blobs only (spec §9): bytes never live in the doc. */
const BlobImage = Image.extend({
  addAttributes() {
    return { ...this.parent?.(), blobId: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'img[src^="/api/blob/"]' }];
  },
});

export const BLOCK_ID_TYPES = ["title", "byline", "pending", "embed", "tableRow", "heading", "paragraph", "bulletList", "orderedList", "taskList", "listItem", "taskItem", "blockquote", "codeBlock", "horizontalRule", "table", "image"];

export function buildExtensions(opts: { onSlash: (s: SlashState | null) => void; history?: boolean; getAuthor?: () => { id: string; name: string } | null }): AnyExtension[] {
  return [
    StarterKit.configure({
      document: false,
      undoRedo: opts.history ? {} : false, // collaborative mode: Yjs UndoManager handles history
      codeBlock: false,
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        isAllowedUri: (url, ctx) => ctx.defaultValidate(url) && isSafeHref(url),
        HTMLAttributes: { rel: "noopener noreferrer nofollow" },
      },
    }),
    Doc,
    Title,
    Byline.configure({ getAuthor: opts.getAuthor ?? (() => null) }),
    MentionChip,
    DateChip,
    DropdownChip,
    Pending,
    Embed,
    CommentMark,
    CodeBlockLowlight.extend({
      addNodeView() {
        return ReactNodeViewRenderer(CodeBlockView);
      },
    }).configure({ lowlight, defaultLanguage: null }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight,
    BlobImage.configure({ inline: false, allowBase64: false }),
    Table.configure({ resizable: true }),
    TableRow,
    HeaderWithBg,
    CellWithBg,
    UniqueID.configure({ types: BLOCK_ID_TYPES, attributeName: "id" }),
    Placeholder.configure({ placeholder: ({ node }) => (node.type.name === "title" ? "Untitled" : "Type / for blocks") }),
    Markdown,
    slashExtension(opts.onSlash),
    Extension.create({
      name: "cnShortcuts",
      addKeyboardShortcuts() {
        return {
          "Mod-k": () => {
            const prev = this.editor.getAttributes("link").href as string | undefined;
            const url = window.prompt("Link URL", prev ?? "https://");
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
