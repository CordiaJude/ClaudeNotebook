import type { Node } from "prosemirror-model";
import { versionOf } from "./ids";
import { toMarkdown } from "./markdown";

export type Located = { node: Node; pos: number; index: number };

/** A top-level block by id. */
export function findBlock(doc: Node, id: string): Located | null {
  let found: Located | null = null;
  doc.forEach((node, pos, index) => { if (!found && node.attrs.id === id) found = { node, pos, index }; });
  return found;
}

/** A new document: the title and one empty paragraph. */
export const isBlank = (doc: Node): boolean => doc.childCount === 2 && doc.child(1).type.name === "paragraph" && doc.child(1).content.size === 0;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const kind = (n: Node) => (n.type.name === "heading" ? `h${n.attrs.level}` : n.type.name === "draftSlot" ? "unwritten" : n.type.name);

/** One line per top-level block: its id, its version, what it is, and how it starts. */
export function outline(doc: Node): string {
  const lines: string[] = [];
  doc.forEach((n) => {
    const text = n.type.name === "draftSlot" ? String(n.attrs.intent) : n.textContent.replace(/\s+/g, " ");
    lines.push(`[${n.attrs.id ?? "?"} v${versionOf(n)}] ${kind(n)}: ${clip(text, 90)}`);
  });
  return lines.join("\n");
}

export const blockMarkdown = (doc: Node, id: string): string | null => { const b = findBlock(doc, id); return b ? toMarkdown([b.node]) : null; };

export function searchBlocks(doc: Node, query: string, max = 12): string {
  const q = query.toLowerCase();
  const hits: string[] = [];
  doc.forEach((n) => { if (hits.length < max && n.textContent.toLowerCase().includes(q)) hits.push(`[${n.attrs.id} v${versionOf(n)}] ${kind(n)}: ${clip(n.textContent.replace(/\s+/g, " "), 160)}`); });
  return hits.length ? hits.join("\n") : `Nothing in the document contains "${clip(query, 40)}".`;
}

export const plainText = (doc: Node): string => doc.textBetween(0, doc.content.size, "\n", " ");
export const titleOf = (doc: Node): string => (doc.firstChild?.type.name === "title" ? doc.firstChild.textContent.trim() : "");
