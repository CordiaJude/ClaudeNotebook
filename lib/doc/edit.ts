/* Every change the AI can make to a document, as pure functions: document in, new document out (or a reason why not).
   Each change is atomic and records what it replaced, so a whole AI run can be put back in one step. */
import { Fragment, type Node } from "prosemirror-model";
import { Transform } from "prosemirror-transform";
import { versionOf, withIds } from "./ids";
import { parseMarkdown, toMarkdown } from "./markdown";
import { findBlock, isBlank } from "./read";
import { docSchema } from "./schema";

export type Fail = { ok: false; reason: "gone" | "changed" | "not_found" | "ambiguous" | "invalid" | "not_blank" | "outside"; message: string; current?: string };
export type Stamp = { id: string; version: string };
/** What one change did: the blocks it took out (as JSON) and the blocks it put in, plus the block before them. */
export type UndoEntry = { anchor: string | null; removed: unknown[]; added: Stamp[]; title?: { before: string; after: string } };
export type Ok = { ok: true; doc: Node; undo: UndoEntry; changed: Stamp[] };
export type Result = Ok | Fail;

const fail = (reason: Fail["reason"], message: string, current?: string): Fail => ({ ok: false, reason, message, ...(current !== undefined ? { current } : {}) });
const stamp = (n: Node): Stamp => ({ id: String(n.attrs.id), version: versionOf(n) });
const MAX_BLOCKS_PER_CHANGE = 60;

function rebuild(doc: Node, children: Node[]): Node {
  const schema = docSchema();
  if (children.length < 2) children = [...children, schema.nodes.paragraph!.create()];
  const next = withIds(schema.nodes.doc!.create(null, Fragment.from(children)));
  next.check();
  return next;
}

/** Replace the top-level blocks [from, to) with `nodes`. The one primitive every block change is built on. */
export function splice(doc: Node, from: number, to: number, nodes: Node[]): Result {
  if (from < 1) return fail("invalid", "The title cannot be replaced this way. Use set_title.");
  if (nodes.length > MAX_BLOCKS_PER_CHANGE) return fail("invalid", `That is ${nodes.length} blocks in one change. Write at most ${MAX_BLOCKS_PER_CHANGE} at a time.`);
  const kids: Node[] = [];
  doc.forEach((n) => kids.push(n));
  const removed = kids.slice(from, to);
  let next: Node;
  try { next = rebuild(doc, [...kids.slice(0, from), ...nodes, ...kids.slice(to)]); }
  catch { return fail("invalid", "That content does not fit the document. Use plain paragraphs, headings, lists and tables."); }
  const added: Stamp[] = [];
  for (let i = from; i < from + Math.max(nodes.length, next.childCount - (kids.length - (to - from))); i++) if (i < next.childCount) added.push(stamp(next.child(i)));
  return { ok: true, doc: next, undo: { anchor: String(kids[from - 1]!.attrs.id ?? "") || null, removed: removed.map((n) => n.toJSON()), added }, changed: added };
}

export type Section = { heading?: string | null; intent: string };
/** Plan a new document: set its title and lay down one placeholder per section. Only on a blank document. */
export function layOut(doc: Node, plan: { title: string; sections: Section[] }): Result {
  const schema = docSchema();
  if (!isBlank(doc)) return fail("not_blank", "This document already has content. Read it and change it with the editing tools instead of laying it out again.");
  const sections = (plan.sections ?? []).filter((s) => s && typeof s.intent === "string" && s.intent.trim());
  if (sections.length === 0 || sections.length > 20) return fail("invalid", "Give between 1 and 20 sections, each with an intent that says what it will cover.");
  const body: Node[] = [];
  for (const s of sections) {
    if (s.heading?.trim()) body.push(schema.nodes.heading!.create({ level: 2 }, schema.text(s.heading.trim().slice(0, 200))));
    body.push(schema.nodes.draftSlot!.create({ intent: s.intent.trim().slice(0, 300) }));
  }
  const before = doc.child(0).textContent;
  const title = before.trim() ? before : (plan.title ?? "").trim().slice(0, 200);
  const titled = title === before ? doc : rebuild(doc, [doc.child(0).type.create(doc.child(0).attrs, title ? schema.text(title) : null), doc.child(1)]);
  const res = splice(titled, 1, 2, body);
  if (res.ok && title !== before) res.undo.title = { before, after: title };
  return res;
}

/** Write a planned section: the placeholder becomes real content. */
export function fillSlot(doc: Node, slotId: string, markdown: string): Result {
  const slot = findBlock(doc, slotId);
  if (!slot) return fail("gone", "That section's placeholder is no longer in the document: a person removed it. Skip this section and do not add it back.");
  if (slot.node.type.name !== "draftSlot") return fail("invalid", "That block is already written. To change it, use replace_block.");
  const nodes = parseMarkdown(markdown);
  if (nodes.length === 0) return fail("invalid", "The section is empty. Write its content as markdown.");
  return splice(doc, slot.index, slot.index + 1, nodes);
}

function guarded(doc: Node, id: string, expect: string | undefined): Fail | { index: number; node: Node } {
  const b = findBlock(doc, id);
  if (!b) return fail("gone", "That block is no longer in the document. Read the outline again.");
  if (b.index === 0) return fail("invalid", "That is the title. Use set_title to change it.");
  if (expect && expect.replace(/^v/, "") !== versionOf(b.node)) return fail("changed", "A person changed that block after you read it. Work from its current content, shown here, and keep their change.", toMarkdown([b.node]));
  return { index: b.index, node: b.node };
}

export function replaceBlock(doc: Node, id: string, markdown: string, expect?: string): Result {
  const g = guarded(doc, id, expect);
  if ("ok" in g) return g;
  const nodes = parseMarkdown(markdown);
  if (nodes.length === 0) return fail("invalid", "The replacement is empty. To remove a block, use delete_block.");
  return splice(doc, g.index, g.index + 1, nodes);
}

export function deleteBlock(doc: Node, id: string, expect?: string): Result {
  const g = guarded(doc, id, expect);
  if ("ok" in g) return g;
  return splice(doc, g.index, g.index + 1, []);
}

export function insertBlocks(doc: Node, where: { after?: string; at?: "start" | "end" }, markdown: string): Result {
  const nodes = parseMarkdown(markdown);
  if (nodes.length === 0) return fail("invalid", "There is nothing to insert. Write the content as markdown.");
  let index = doc.childCount;
  if (where.after) {
    const b = findBlock(doc, where.after);
    if (!b) return fail("gone", "The block to insert after is no longer in the document. Read the outline again.");
    index = b.index + 1;
  } else if (where.at === "start") index = 1;
  // A blank document's lone empty paragraph is replaced rather than left dangling.
  if (isBlank(doc)) return splice(doc, 1, 2, nodes);
  return splice(doc, index, index, nodes);
}

/** Change some words inside one block and leave everything else in it, formatting included, as it was. */
export function replaceText(doc: Node, id: string, find: string, replacement: string, occurrence?: number): Result {
  const b = findBlock(doc, id);
  if (!b) return fail("gone", "That block is no longer in the document. Read the outline again.");
  if (!find) return fail("invalid", "Say which words to find.");
  const hits: { from: number; to: number }[] = [];
  b.node.descendants((n, rel) => {
    if (!n.isTextblock) return true;
    const text = n.textBetween(0, n.content.size, undefined, "￼");
    for (let i = text.indexOf(find); i >= 0; i = text.indexOf(find, i + find.length)) hits.push({ from: b.pos + 1 + rel + 1 + i, to: b.pos + 1 + rel + 1 + i + find.length });
    return false;
  });
  if (b.node.isTextblock) {
    const text = b.node.textBetween(0, b.node.content.size, undefined, "￼");
    for (let i = text.indexOf(find); i >= 0; i = text.indexOf(find, i + find.length)) hits.push({ from: b.pos + 1 + i, to: b.pos + 1 + i + find.length });
  }
  if (hits.length === 0) return fail("not_found", "Those words are not in that block now. Quote them exactly as they stand in its current content, shown here.", toMarkdown([b.node]));
  if (hits.length > 1 && !occurrence) return fail("ambiguous", `Those words appear ${hits.length} times in that block. Quote more words around the one you mean, or pass occurrence (1 is the first).`);
  const hit = hits[(occurrence ?? 1) - 1];
  if (!hit) return fail("not_found", `Those words appear ${hits.length} time(s) in that block; there is no occurrence ${occurrence}.`);
  const tr = new Transform(doc);
  const marks = doc.resolve(hit.from).marksAcross(doc.resolve(hit.to)) ?? doc.resolve(hit.from + 1).marks();
  if (replacement) tr.replaceWith(hit.from, hit.to, docSchema().text(replacement, marks)); else tr.delete(hit.from, hit.to);
  let next: Node;
  try { next = withIds(tr.doc); next.check(); } catch { return fail("invalid", "That change does not fit the document."); }
  const after = next.child(b.index);
  return { ok: true, doc: next, undo: { anchor: b.index > 0 ? String(doc.child(b.index - 1).attrs.id) : null, removed: [b.node.toJSON()], added: [stamp(after)] }, changed: [stamp(after)] };
}

export function setTitle(doc: Node, text: string): Result {
  const schema = docSchema();
  const before = doc.child(0).textContent;
  const after = text.trim().slice(0, 200);
  const kids: Node[] = [];
  doc.forEach((n, _o, i) => kids.push(i === 0 ? n.type.create(n.attrs, after ? schema.text(after) : null) : n));
  const next = rebuild(doc, kids);
  return { ok: true, doc: next, undo: { anchor: null, removed: [], added: [], title: { before, after } }, changed: [stamp(next.child(0))] };
}

/** Remove placeholders that were never written, and a heading left with nothing under it (used when a draft is stopped). */
export function dropUnwritten(doc: Node): Node {
  const kids: Node[] = [];
  doc.forEach((n, _o, i) => {
    if (n.type.name === "draftSlot") return;
    if (n.type.name === "heading" && i + 1 < doc.childCount && doc.child(i + 1).type.name === "draftSlot") return;
    kids.push(n);
  });
  return kids.length === doc.childCount ? doc : rebuild(doc, kids);
}

/** Put back what a run changed, newest change first. Blocks a person has edited since are reported, not overwritten, unless `force`. */
export function undoAll(doc: Node, entries: UndoEntry[], opts: { force?: boolean } = {}): { ok: true; doc: Node } | { ok: false; conflicts: string[] } {
  const schema = docSchema();
  const conflicts: string[] = [];
  let cur = doc;
  for (const e of [...entries].reverse()) {
    const kids: Node[] = [];
    cur.forEach((n) => kids.push(n));
    const present = e.added.map((a) => ({ a, i: kids.findIndex((k) => k.attrs.id === a.id) })).filter((x) => x.i >= 1);
    for (const { a, i } of present) if (versionOf(kids[i]!) !== a.version) conflicts.push(kids[i]!.textContent.replace(/\s+/g, " ").slice(0, 80) || "(an empty block)");
    if (conflicts.length && !opts.force) continue;
    let at = present.length ? Math.min(...present.map((x) => x.i)) : -1;
    if (at < 0) { const anchor = e.anchor ? kids.findIndex((k) => k.attrs.id === e.anchor) : -1; at = anchor >= 0 ? anchor + 1 : kids.length; }
    const gone = new Set(present.map((x) => x.i));
    const restored = e.removed.map((j) => schema.nodeFromJSON(j as never));
    const next = [...kids.slice(0, at).filter((_k, i) => !gone.has(i)), ...restored, ...kids.slice(at).filter((_k, i) => !gone.has(i + at))];
    if (e.title && next[0] && (next[0].textContent === e.title.after || opts.force)) next[0] = next[0].type.create(next[0].attrs, e.title.before ? schema.text(e.title.before) : null);
    cur = rebuild(cur, next);
  }
  return conflicts.length && !opts.force ? { ok: false, conflicts: [...new Set(conflicts)] } : { ok: true, doc: cur };
}
