/* Pinning a selection so the server can find it again. Safe for the browser: no Node-only imports. */
import type { Node } from "prosemirror-model";

/** A selected range, as the top-level blocks it starts and ends in, the offsets inside them, and the text it held. */
export type Scope = { startBlock: string; startOffset: number; endBlock: string; endOffset: number; text: string };

export const rangeText = (doc: Node, from: number, to: number): string => doc.textBetween(from, to, "\n", "￼");

function topBlockAt(doc: Node, pos: number): { id: string; start: number } | null {
  const $p = doc.resolve(pos);
  if ($p.depth < 1) return null;
  const node = $p.node(1);
  return node.attrs.id ? { id: String(node.attrs.id), start: $p.before(1) } : null;
}

/** Built in the browser from the editor's selection. Null when the selection is empty or touches the title. */
export function scopeOf(doc: Node, from: number, to: number): Scope | null {
  if (to <= from) return null;
  const a = topBlockAt(doc, from), b = topBlockAt(doc, to);
  if (!a || !b) return null;
  if (doc.resolve(from).node(1).type.name === "title" || doc.resolve(to).node(1).type.name === "title") return null;
  const text = rangeText(doc, from, to);
  if (!text.trim()) return null;
  return { startBlock: a.id, startOffset: from - a.start, endBlock: b.id, endOffset: to - b.start, text };
}
