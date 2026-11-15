/* "Edit with AI": change a selected range and nothing else. The server finds the range again on the current document,
   performs the one replacement itself, and proves that everything outside the range is exactly as it was. */
import { Fragment, Slice, type Node } from "prosemirror-model";
import { Transform } from "prosemirror-transform";
import { versionOf, withIds } from "./ids";
import { inlineMarkdown, parseInline, parseMarkdown, toMarkdown } from "./markdown";
import { findBlock } from "./read";
import type { Fail, Result } from "./edit";
import { rangeText, type Scope } from "./scope";

const fail = (reason: Fail["reason"], message: string): Fail => ({ ok: false, reason, message });
const CHANGED = "The selected text changed while the AI was working, so nothing was changed. Select it again and retry.";

/** Find the pinned range on the document as it is now. If text was added before it in the same block, it is found again by its words. */
export function resolveScope(doc: Node, s: Scope): { ok: true; from: number; to: number } | Fail {
  const a = findBlock(doc, s.startBlock), b = findBlock(doc, s.endBlock);
  if (!a || !b) return fail("gone", "The selected text is no longer in the document, so nothing was changed.");
  if (a.index === 0 || b.index === 0) return fail("invalid", "The title cannot be rewritten this way. Click it and type.");
  const from = a.pos + s.startOffset, to = b.pos + s.endOffset;
  const inside = from > a.pos && to <= b.pos + b.node.nodeSize && to > from;
  if (inside && rangeText(doc, from, to) === s.text) return { ok: true, from, to };
  if (s.startBlock !== s.endBlock) return fail("changed", CHANGED);
  const size = s.endOffset - s.startOffset, hits: number[] = [];
  for (let p = a.pos + 1; p + size <= a.pos + a.node.nodeSize - 1; p++) { try { if (rangeText(doc, p, p + size) === s.text) hits.push(p); } catch { /* not a valid range */ } }
  return hits.length === 1 ? { ok: true, from: hits[0]!, to: hits[0]! + size } : fail("changed", CHANGED);
}

const cellOf = (doc: Node, pos: number): Node | null => {
  const $p = doc.resolve(pos);
  for (let d = $p.depth; d > 0; d--) if ($p.node(d).type.name === "tableCell" || $p.node(d).type.name === "tableHeader") return $p.node(d);
  return null;
};

/** What the model is shown: the selection as markdown, and a little of what surrounds it, to read but not to change. */
export function describeSelection(doc: Node, from: number, to: number): { ok: true; inline: boolean; markdown: string; before: string; after: string } | Fail {
  if (cellOf(doc, from) !== cellOf(doc, to)) return fail("invalid", "That selection crosses table cells. Select text inside one cell, or select whole paragraphs, and try again.");
  const $from = doc.resolve(from), $to = doc.resolve(to);
  const inline = $from.sameParent($to) && $from.parent.isTextblock;
  const slice = doc.slice(from, to);
  const blocks: Node[] = [];
  slice.content.forEach((n) => blocks.push(n));
  return {
    ok: true, inline,
    markdown: inline ? inlineMarkdown(slice.content) : toMarkdown(blocks),
    before: rangeText(doc, Math.max(0, from - 400), from).slice(-300),
    after: rangeText(doc, to, Math.min(doc.content.size, to + 400)).slice(0, 300),
  };
}

function stripIds(json: unknown): unknown {
  if (Array.isArray(json)) return json.map(stripIds);
  if (json && typeof json === "object") return Object.fromEntries(Object.entries(json as object).filter(([k]) => k !== "id").map(([k, v]) => [k, stripIds(v)]));
  return json;
}
const same = (a: Slice, b: Slice) => JSON.stringify(stripIds(a.content.toJSON())) === JSON.stringify(stripIds(b.content.toJSON()));

/** True when `next` differs from `doc` only between `from` and `to`. */
export function onlyRangeChanged(doc: Node, next: Node, from: number, to: number): boolean {
  const tail = doc.content.size - to;
  if (next.content.size < from + tail) return false;
  try { return same(doc.slice(0, from), next.slice(0, from)) && same(doc.slice(to), next.slice(next.content.size - tail)); } catch { return false; }
}

/** Replace [from, to) with the model's text. Refuses any result that would touch something outside the range. */
export function replaceSelection(doc: Node, from: number, to: number, replacement: string): Result {
  const d = describeSelection(doc, from, to);
  if (!d.ok) return d;
  const schema = doc.type.schema;
  const tr = new Transform(doc);
  if (d.inline) {
    const content = parseInline(replacement);
    if (content === null) return fail("invalid", "The selection is part of one paragraph, so the replacement must be a single line of text with no headings, lists or blank lines.");
    const marks = doc.resolve(from).marksAcross(doc.resolve(to)) ?? [];
    const kept: Node[] = [];
    content.forEach((n) => kept.push(n.isText && n.marks.length === 0 && marks.length ? schema.text(n.text!, marks) : n));
    if (kept.length) tr.replaceWith(from, to, Fragment.from(kept)); else tr.delete(from, to);
  } else {
    const blocks = parseMarkdown(replacement);
    if (blocks.length === 0) tr.delete(from, to);
    else {
      const open = (edge: Node, parent: Node) => (edge.isTextblock && parent.isTextblock && edge.type === parent.type ? 1 : 0);
      tr.replaceRange(from, to, new Slice(Fragment.from(blocks), open(blocks[0]!, doc.resolve(from).parent), open(blocks.at(-1)!, doc.resolve(to).parent)));
    }
  }
  let next: Node;
  try { next = withIds(tr.doc); next.check(); } catch { return fail("invalid", "That replacement does not fit where the selection is. Reply with plain text."); }
  if (!onlyRangeChanged(doc, next, from, to)) return fail("outside", "That replacement would have changed text outside the selection, so it was not applied. Reply with plain text that fits the selection.");
  const first = doc.resolve(from).index(0), last = doc.resolve(to).index(0);
  const removed: unknown[] = [], added = [];
  for (let i = first; i <= last; i++) removed.push(doc.child(i).toJSON());
  for (let i = first; i <= next.childCount - (doc.childCount - last); i++) added.push({ id: String(next.child(i).attrs.id), version: versionOf(next.child(i)) });
  return { ok: true, doc: next, undo: { anchor: first > 0 ? String(doc.child(first - 1).attrs.id) : null, removed, added }, changed: added };
}
