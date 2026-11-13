import { Fragment, type Mark, type Node, type Schema } from "prosemirror-model";
import { Transform } from "prosemirror-transform";
import { isCellColor } from "@/lib/editor/constants";
import { OpError, fail, type OpFailure } from "./errors";
import { blockHash } from "./hash";
import { assignIds } from "./ids";
import { blocksFromMarkdown, inlineNodes, type ChipCtx } from "./markdown";
import { DEFAULT_ANCHOR_MARKS, anchorThreads, chipsInRange, countChips, requireHash, requireNoAnchors } from "./guards";
import { contiguous, findById, isStructural, resolveBlocks, resolveCell, resolveFind, type Found } from "./targets";
import { MAX_OPS, type ApplyResult, type Content, type Op, type Touched } from "./types";

export type ApplyOptions = { schema: Schema; ctx: ChipCtx; anchorMarks?: string[] };

const LISTS = ["bulletList", "orderedList", "taskList"];
const ITEM_OF: Record<string, string> = { bulletList: "listItem", orderedList: "listItem", taskList: "taskItem" };
const KIND_TO_LIST: Record<string, string> = { bullet: "bulletList", ordered: "orderedList", task: "taskList" };

function textOf(c: Content): string {
  if (c.as === "row" || c.as === "cells") return fail("bad_request", `content.as "${c.as}" is only valid for table inserts.`);
  if (c.from?.kind !== "inline" || typeof c.from.content !== "string") return fail("bad_request", 'content.from must be {kind:"inline", content: string}.');
  return c.from.content;
}

export function applyOps(doc: Node, ops: Op[], opts: ApplyOptions): ApplyResult {
  if (!Array.isArray(ops) || ops.length === 0) return { ok: false, code: "bad_request", fix: "ops must be a non-empty array." };
  if (ops.length > MAX_OPS) return { ok: false, code: "too_many", fix: `Max ${MAX_OPS} ops per call; send fewer.` };
  const { schema, ctx } = opts;
  const anchorMarks = opts.anchorMarks ?? DEFAULT_ANCHOR_MARKS;
  const tr = new Transform(doc);
  const detached = new Set<string>();

  const markdownBlocks = (c: Content): { nodes: Node[]; chipCount: number } => {
    if (c.as === "row" || c.as === "cells") return fail("bad_request", `content.as "${c.as}" is only valid for table inserts.`);
    if (c.as === "markdown") return blocksFromMarkdown(schema, textOf(c), c.blocks, ctx);
    const inl = inlineNodes(schema, textOf(c), [], c.blocks, ctx);
    if (!inl.length) return fail("bad_request", "content is empty. To remove something, use delete.");
    return { nodes: [assignIds(schema.nodes.paragraph!.create(null, inl))], chipCount: inl.filter((n) => !n.isText).length };
  };

  const inlineFor = (text: string, marksSrc: readonly Mark[], parent: Node, blocks: Record<string, Record<string, unknown>> | undefined) => {
    if (!text.trim() && !/<\?cn block/.test(text)) fail("bad_request", "content is empty. To remove words, use delete.");
    const marks = marksSrc.filter((m) => !anchorMarks.includes(m.type.name) && parent.type.allowsMarkType(m.type));
    return inlineNodes(schema, text, marks, blocks, ctx);
  };

  /** Exact placement only: if the parent cannot take these nodes as they are, refuse (ProseMirror would otherwise split lists/wrap silently). */
  const place = (at: number, nodes: Node[]) => {
    const $a = tr.doc.resolve(at);
    if (!$a.parent.canReplace($a.index(), $a.index(), Fragment.from(nodes))) fail("bad_request", `A ${nodes[0]?.type.name ?? "block"} cannot go directly inside a ${$a.parent.type.name} there. Insert next to a top-level block instead.`);
    tr.insert(at, nodes);
  };
  const swap = (from: number, to: number, nodes: Node[]) => {
    const $f = tr.doc.resolve(from), $t = tr.doc.resolve(to);
    if ($f.parent !== $t.parent && !$f.sameParent($t)) fail("bad_request", "That range crosses container boundaries.");
    if (!$f.parent.canReplace($f.index(), $t.index(), Fragment.from(nodes))) fail("bad_request", `A ${nodes[0]?.type.name ?? "block"} cannot replace that here (a ${$f.parent.type.name} would become invalid).`);
    tr.replaceWith(from, to, nodes);
  };

  const guardAll = (found: Found[], ifHash: string | Record<string, string> | undefined) => {
    for (const f of found) requireHash(f.node, ifHash, `${f.node.type.name} ${f.node.attrs.id ?? ""}`.trim());
  };
  const noStructure = (found: Found[], what: string) => {
    for (const f of found) if (isStructural(f.node)) fail("bad_request", `The ${f.node.type.name} is structural and cannot be ${what} as a block. Reword it with a find target on its text.`);
  };
  const cleanThreads = (from: number, to: number, allow: boolean | undefined, where: string) => {
    const t = anchorThreads(tr.doc, from, to, anchorMarks);
    requireNoAnchors(t, allow, where);
    t.forEach((x) => detached.add(x));
  };

  function run(op: Op) {
    switch (op.op) {
      case "restore":
        return fail("bad_request", "restore needs version history, which arrives in a later phase. Use notebook_history once it exists.");

      case "replace": {
        const t = op.target;
        if (t.kind === "find") {
          const { from, to } = resolveFind(tr.doc, t);
          cleanThreads(from, to, op.allowDetach, "These words");
          const $f = tr.doc.resolve(from);
          const nodes = inlineFor(textOf(op.content), tr.doc.slice(from, to).content.firstChild?.marks ?? [], $f.parent, op.content.as === "text" || op.content.as === "markdown" ? op.content.blocks : undefined);
          tr.replaceWith(from, to, nodes);
          return;
        }
        if (t.kind === "root") return fail("bad_request", "Cannot replace the whole tab. Replace blocks by id, or use find.");
        if (t.kind === "cell") {
          const cell = resolveCell(tr.doc, t);
          requireHash(cell.node, op.ifHash, `cell ${t.row},${t.col}`);
          const { nodes, chipCount } = markdownBlocks(op.content);
          cleanThreads(cell.pos, cell.pos + cell.node.nodeSize, op.allowDetach, "This cell");
          if (countChips(cell.node) > chipCount) fail("dropped", "This cell holds chips (dates, mentions, dropdowns) that your content does not re-spell. Read the cell and re-add them with <?cn block KEY?> tokens, or edit with find.");
          swap(cell.pos + 1, cell.pos + cell.node.nodeSize - 1, nodes);
          return;
        }
        // blocks
        const found = resolveBlocks(tr.doc, t.ids);
        noStructure(found, "replaced");
        const { from, to } = contiguous(found);
        guardAll(found, op.ifHash);
        // Reword a single text block in place: keeps its id, type and chips.
        if (found.length === 1 && found[0]!.node.isTextblock && op.content.as === "text") {
          const f = found[0]!;
          cleanThreads(f.pos, f.pos + f.node.nodeSize, op.allowDetach, "This block");
          const marks = f.node.firstChild?.marks ?? [];
          const inl = inlineFor(textOf(op.content), marks, f.node, op.content.blocks);
          swap(f.pos + 1, f.pos + f.node.nodeSize - 1, inl);
          return;
        }
        const { nodes, chipCount } = markdownBlocks(op.content);
        const oldChips = found.reduce((a, f) => a + (f.node.type.name === "pending" ? 0 : (f.node.isAtom && f.node.type.name === "embed" ? 1 : 0) + countChips(f.node)), 0);
        if (oldChips > chipCount) fail("dropped", `These blocks hold ${oldChips} chip(s) (dates, mentions, dropdowns, embeds) and your markdown re-spells ${chipCount}. Read them with notebook_read and include every chip as a <?cn block KEY?> token, or reword with find.`);
        cleanThreads(from, to, op.allowDetach, "These blocks");
        if (found.length === 1 && nodes.length === 1 && nodes[0]!.type === found[0]!.node.type && found[0]!.node.attrs.id) {
          nodes[0] = nodes[0]!.type.create({ ...nodes[0]!.attrs, id: found[0]!.node.attrs.id }, nodes[0]!.content, nodes[0]!.marks); // keep the id stable
        }
        swap(from, to, nodes);
        return;
      }

      case "insert": {
        const t = op.target;
        const c = op.content;
        if (t.kind === "find") {
          if (op.side !== "before" && op.side !== "after") fail("bad_request", 'Inserting at a find target needs side "before" or "after".');
          const { from, to } = resolveFind(tr.doc, t);
          const at = op.side === "before" ? from : to;
          const $a = tr.doc.resolve(at);
          const near = (op.side === "before" ? $a.nodeAfter : $a.nodeBefore)?.marks ?? [];
          place(at, inlineFor(textOf(c), near, $a.parent, c.as === "text" || c.as === "markdown" ? c.blocks : undefined));
          return;
        }
        if (t.kind === "root") {
          const title = tr.doc.child(0), by = tr.doc.child(1);
          const at = op.side === "end" ? tr.doc.content.size : op.side === "start" ? title.nodeSize + by.nodeSize : fail("bad_request", 'Inserting at the root needs side "start" or "end".');
          place(at, markdownBlocks(c).nodes);
          return;
        }
        if (t.kind === "cell") {
          if (c.as === "cells") {
            if (op.side !== "before" && op.side !== "after") fail("bad_request", 'Inserting a column needs side "before" or "after".');
            if (!op.each) fail("bad_request", "Inserting a column needs each:true (a cell goes into every row).");
            const ref = resolveCell(tr.doc, t);
            const table = ref.table;
            // Build from the last row up so earlier positions stay valid.
            const inserts: { pos: number; node: Node }[] = [];
            let rowPos = table.pos + 1;
            table.node.forEach((row, _o, ri) => {
              let cp = rowPos + 1;
              row.forEach((cell, _o2, ci) => {
                if (ci === ref.col) {
                  const at = op.side === "before" ? cp : cp + cell.nodeSize;
                  const type = row.child(ci).type;
                  const txt = c.values[ri] ?? "";
                  inserts.push({ pos: at, node: type.create(null, schema.nodes.paragraph!.create(null, txt ? schema.text(txt) : null)) });
                }
                cp += cell.nodeSize;
              });
              rowPos += row.nodeSize;
            });
            for (const i of inserts.reverse()) place(i.pos, [assignIds(i.node)]);
            return;
          }
          const cell = resolveCell(tr.doc, t);
          const { nodes } = markdownBlocks(c);
          if (op.side === "start") place(cell.pos + 1, nodes);
          else if (op.side === "end") place(cell.pos + cell.node.nodeSize - 1, nodes);
          else fail("bad_request", 'Inserting into a cell needs side "start" or "end".');
          return;
        }
        // blocks
        const found = resolveBlocks(tr.doc, t.ids);
        if (found.length !== 1) fail("bad_request", "Insert before/after takes exactly one block id.");
        const f = found[0]!;
        if (op.side !== "before" && op.side !== "after") fail("bad_request", 'Inserting next to a block needs side "before" or "after".');
        if (f.node.type.name === "title") fail("bad_request", "Nothing can go between the title and the byline. Insert after the byline instead.");
        if (f.node.type.name === "byline" && op.side === "before") fail("bad_request", "Nothing can go before the byline.");
        const at = op.side === "before" ? f.pos : f.pos + f.node.nodeSize;
        if (c.as === "row") {
          if (f.node.type.name !== "tableRow") fail("bad_request", "content.as row needs a tableRow id as the target.");
          if (c.cells.length !== f.node.childCount) fail("bad_request", `This table has ${f.node.childCount} columns; send ${f.node.childCount} cell values.`);
          const row = f.node.type.create(null, c.cells.map((v) => schema.nodes.tableCell!.create(null, schema.nodes.paragraph!.create(null, v ? schema.text(v) : null))));
          place(at, [assignIds(row)]);
          return;
        }
        place(at, markdownBlocks(c).nodes);
        return;
      }

      case "delete": {
        const t = op.target;
        if (t.kind === "find") {
          const { from, to } = resolveFind(tr.doc, t);
          cleanThreads(from, to, op.allowDetach, "These words");
          tr.delete(from, to);
          return;
        }
        if (t.kind === "root") return fail("bad_request", "Cannot delete the whole tab.");
        if (t.kind === "cell") {
          if (!op.each) return fail("bad_request", "Deleting a column needs each:true; to delete a row, target its row id with kind blocks.");
          const ref = resolveCell(tr.doc, t);
          if (ref.table.node.firstChild!.childCount <= 1) fail("last_block", "A table needs at least one column. Delete the table instead.");
          const spans: { from: number; to: number }[] = [];
          let rowPos = ref.table.pos + 1;
          ref.table.node.forEach((row) => {
            let cp = rowPos + 1;
            row.forEach((cell, _o, ci) => { if (ci === ref.col) spans.push({ from: cp, to: cp + cell.nodeSize }); cp += cell.nodeSize; });
            rowPos += row.nodeSize;
          });
          cleanThreads(ref.table.pos, ref.table.pos + ref.table.node.nodeSize, op.allowDetach, "This column");
          for (const s of spans.reverse()) tr.delete(s.from, s.to);
          return;
        }
        const found = resolveBlocks(tr.doc, t.ids);
        noStructure(found, "deleted");
        guardAll(found, op.ifHash);
        // Never leave a tab without a body block.
        const topIds = new Set(found.filter((f) => f.parent === tr.doc).map((f) => f.node.attrs.id));
        const bodyLeft = tr.doc.childCount - 2 - topIds.size;
        if (bodyLeft < 1) fail("last_block", "That would delete the tab's last block. Replace its content instead (a tab is never empty).");
        // Delete bottom-up so earlier positions hold. An only list item takes its list with it.
        for (const f of [...found].reverse()) {
          const cur = findById(tr.doc, f.node.attrs.id as string);
          if (!cur) continue;
          if (cur.node.type.name === "tableRow" && cur.parent.childCount <= 1) fail("last_block", "A table needs at least one row. Delete the table instead.");
          cleanThreads(cur.pos, cur.pos + cur.node.nodeSize, op.allowDetach, `This ${cur.node.type.name}`);
          if ((cur.node.type.name === "listItem" || cur.node.type.name === "taskItem") && cur.parent.childCount === 1) {
            const list = findById(tr.doc, cur.parent.attrs.id as string);
            if (list) { tr.delete(list.pos, list.pos + list.node.nodeSize); continue; }
          }
          tr.delete(cur.pos, cur.pos + cur.node.nodeSize);
        }
        return;
      }

      case "move": {
        const src = resolveBlocks(tr.doc, op.target.ids);
        noStructure(src, "moved");
        const dst = resolveBlocks(tr.doc, op.to.ids);
        if (dst.length !== 1) fail("bad_request", "move.to takes exactly one block id.");
        const d = dst[0]!;
        if (d.node.type.name === "title" || (d.node.type.name === "byline" && op.side === "before")) fail("bad_request", "Blocks cannot be moved above the byline.");
        for (const s of src) if (d.pos >= s.pos && d.pos < s.pos + s.node.nodeSize) fail("bad_request", "Cannot move a block into itself.");
        const nodes = src.map((s) => s.node);
        let at = op.side === "before" ? d.pos : d.pos + d.node.nodeSize;
        for (const s of [...src].reverse()) { tr.delete(s.pos, s.pos + s.node.nodeSize); if (s.pos < at) at -= s.node.nodeSize; }
        place(at, nodes);
        return;
      }

      case "set": {
        const attrs = op.attrs ?? {};
        const keys = Object.keys(attrs);
        if (!keys.length) fail("bad_request", "attrs is empty.");
        if (op.target.kind === "cell") {
          const cell = resolveCell(tr.doc, op.target);
          const next: Record<string, unknown> = { ...cell.node.attrs };
          for (const k of keys) {
            const v = attrs[k];
            if (k === "background") { if (v !== null && !isCellColor(v)) fail("bad_request", "background must be one of gray, red, orange, yellow, green, blue, purple, or null."); next.background = v; }
            else if (k === "colwidth") { if (v !== null && !(Array.isArray(v) && v.every((n) => Number.isInteger(n) && n > 20 && n < 2000))) fail("bad_request", "colwidth must be null or [pixels]."); next.colwidth = v; }
            else fail("bad_request", `Cells accept background and colwidth (got "${k}"). Merge/split is a UI action for now.`);
          }
          tr.setNodeMarkup(cell.pos, undefined, next);
          return;
        }
        if (op.target.kind !== "blocks") return fail("bad_request", "set needs a blocks or cell target.");
        const found = resolveBlocks(tr.doc, op.target.ids);
        noStructure(found, "restyled");
        for (const f of [...found].reverse()) {
          const cur = findById(tr.doc, f.node.attrs.id as string)!;
          const n = cur.node;
          for (const k of keys) {
            const v = attrs[k];
            if (k === "heading") {
              if (!["paragraph", "heading"].includes(n.type.name)) fail("bad_request", "heading applies to paragraphs and headings.");
              if (v === null) tr.setNodeMarkup(cur.pos, schema.nodes.paragraph, { ...n.attrs, level: undefined });
              else if (v === 1 || v === 2 || v === 3) tr.setNodeMarkup(cur.pos, schema.nodes.heading, { ...n.attrs, level: v });
              else fail("bad_request", "heading must be 1, 2, 3 or null.");
            } else if (k === "kind") {
              if (!LISTS.includes(n.type.name)) fail("bad_request", "kind applies to lists.");
              const lt = KIND_TO_LIST[String(v)];
              if (!lt) fail("bad_request", 'kind must be "bullet", "ordered" or "task".');
              const itemType = schema.nodes[ITEM_OF[lt!]!]!;
              const items: Node[] = [];
              n.forEach((it) => items.push(itemType.create({ id: it.attrs.id, ...(lt === "taskList" ? { checked: false } : {}) }, it.content)));
              swap(cur.pos, cur.pos + n.nodeSize, [schema.nodes[lt!]!.create({ id: n.attrs.id }, items)]);
            } else if (k === "checked") {
              if (n.type.name !== "taskItem") fail("bad_request", "checked applies to task items (target the item's id, not the list).");
              if (typeof v !== "boolean") fail("bad_request", "checked must be true or false.");
              tr.setNodeMarkup(cur.pos, undefined, { ...n.attrs, checked: v });
            } else fail("bad_request", `Unknown attr "${k}". Supported: heading, kind, checked (blocks); background, colwidth (cells).`);
          }
        }
        return;
      }

      case "wrap": {
        const found = resolveBlocks(tr.doc, op.target.ids);
        noStructure(found, "wrapped");
        const { from, to } = contiguous(found);
        const nodes = found.map((f) => f.node);
        if (op.with === "blockquote") { swap(from, to, [assignIds(schema.nodes.blockquote!.create(null, nodes))]); return; }
        const itemType = schema.nodes[ITEM_OF[op.with] ?? ""];
        if (!itemType || !LISTS.includes(op.with)) return fail("bad_request", "wrap.with must be blockquote, bulletList, orderedList or taskList.");
        for (const n of nodes) if (!n.isTextblock || n.type.name === "codeBlock") fail("bad_request", `Only paragraphs and headings can become list items (got ${n.type.name}).`);
        // Keep inline content (marks, chips, comment anchors); a heading becomes a plain paragraph.
        const items = nodes.map((n) => itemType.create(op.with === "taskList" ? { checked: false } : null, n.type.name === "paragraph" ? n : schema.nodes.paragraph!.create({ id: n.attrs.id }, n.content, n.marks)));
        swap(from, to, [assignIds(schema.nodes[op.with]!.create(null, items))]);
        return;
      }

      case "unwrap": {
        const found = resolveBlocks(tr.doc, op.target.ids);
        for (const f of [...found].reverse()) {
          const n = findById(tr.doc, f.node.attrs.id as string)!;
          const kids: Node[] = [];
          if (n.node.type.name === "blockquote") n.node.forEach((c) => kids.push(c));
          else if (LISTS.includes(n.node.type.name)) n.node.forEach((it) => it.forEach((c) => kids.push(c)));
          else fail("bad_request", "unwrap applies to blockquotes and lists.");
          if (kids.length === 0) fail("bad_request", "Nothing inside to unwrap.");
          swap(n.pos, n.pos + n.node.nodeSize, kids);
        }
        return;
      }

      case "join": {
        const found = resolveBlocks(tr.doc, op.target.ids);
        if (found.length !== 2) fail("bad_request", "join takes exactly two adjacent block ids.");
        const [a, b] = found as [Found, Found];
        noStructure(found, "joined");
        if (a.parent !== b.parent || a.pos + a.node.nodeSize !== b.pos) fail("bad_request", "join needs two adjacent sibling blocks.");
        if (a.node.type !== b.node.type) fail("bad_request", "join needs two blocks of the same type.");
        tr.join(b.pos);
        return;
      }
    }
  }

  try {
    ops.forEach((op, i) => {
      try { run(op); }
      catch (e) {
        if (e instanceof OpError) { e.failure.opIndex = i; throw e; }
        const msg = e instanceof Error ? e.message.slice(0, 160) : "invalid edit";
        throw new OpError({ ok: false, code: "bad_request", fix: `That edit would make the document invalid (${msg}). Adjust the op.`, opIndex: i });
      }
    });
    const seen = new Set<string>();
    tr.doc.descendants((n) => { const id = n.attrs.id as string | null | undefined; if (id) { if (seen.has(id)) fail("bad_request", `The result would repeat block id ${id}. Nothing was changed.`); seen.add(id); } });
    try { tr.doc.check(); }
    catch (e) { fail("bad_request", `The result would break the document structure (${e instanceof Error ? e.message.slice(0, 160) : "invalid"}). Nothing was changed.`); }
  } catch (e) {
    if (e instanceof OpError) return e.failure as OpFailure & { ok: false };
    throw e;
  }

  // What changed: top-level blocks whose hash differs or that are new; ids that vanished.
  const before = new Map<string, string>();
  doc.forEach((n) => n.attrs.id && before.set(n.attrs.id as string, blockHash(n)));
  const touched: Touched[] = [];
  const after = new Set<string>();
  tr.doc.forEach((n) => {
    const id = n.attrs.id as string | undefined;
    if (!id) return;
    after.add(id);
    const h = blockHash(n);
    if (before.get(id) !== h) touched.push({ id, h });
  });
  const removed = [...before.keys()].filter((id) => !after.has(id));
  return { ok: true, doc: tr.doc, touched, removed, detached: [...detached] };
}

