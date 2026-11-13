import type { Node } from "prosemirror-model";
import { fail } from "./errors";
import { viewBlock } from "./outline";
import type { CellRef, Target } from "./types";

export type Found = { node: Node; pos: number; parent: Node; index: number };
const OBJ = "￼";

export function findById(doc: Node, id: string): Found | null {
  let out: Found | null = null;
  doc.descendants((node, pos, parent, index) => {
    if (out) return false;
    if (node.attrs.id === id) { out = { node, pos, parent: parent!, index }; return false; }
    return true;
  });
  return out;
}

/** Resolve block ids, in document order. Missing id -> block_gone (a human removed it, or the id is wrong). */
export function resolveBlocks(doc: Node, ids: string[]): Found[] {
  if (!ids.length) fail("bad_request", "target.ids is empty.");
  const found = ids.map((id) => findById(doc, id) ?? fail("block_gone", `Block ${id} no longer exists. If it was a pending block, a person removed it: drop that section. Otherwise re-read the outline.`, { path: id }));
  return found.sort((a, b) => a.pos - b.pos);
}

/** Blocks must be adjacent siblings to be treated as one unit. */
export function contiguous(found: Found[]): { from: number; to: number } {
  for (let i = 1; i < found.length; i++) {
    const a = found[i - 1]!, b = found[i]!;
    if (a.parent !== b.parent) fail("bad_request", "These blocks are not siblings. Edit them in separate ops.");
    if (a.pos + a.node.nodeSize !== b.pos) fail("bad_request", "These blocks are not adjacent. Edit them in separate ops.");
  }
  const last = found.at(-1)!;
  return { from: found[0]!.pos, to: last.pos + last.node.nodeSize };
}

export const isStructural = (n: Node) => n.type.name === "title" || n.type.name === "byline";

/** Text of a textblock with each inline atom as one placeholder char, plus the doc position of every char. */
function textMap(block: Node, blockPos: number): { text: string; pos: number[] } {
  let text = "";
  const pos: number[] = [];
  block.forEach((c, off) => {
    const p = blockPos + 1 + off;
    if (c.isText) for (let i = 0; i < (c.text?.length ?? 0); i++) { text += c.text![i]; pos.push(p + i); }
    else { text += OBJ; pos.push(p); }
  });
  return { text, pos };
}

export function resolveCell(doc: Node, ref: CellRef): { pos: number; node: Node; row: number; col: number; table: Found } {
  const table = findById(doc, ref.table) ?? fail("block_gone", `Table ${ref.table} no longer exists.`, { path: ref.table });
  if (table.node.type.name !== "table") fail("bad_request", `Block ${ref.table} is not a table.`);
  const rows = table.node.childCount;
  const row = ref.row === -1 ? rows - 1 : ref.row;
  if (!Number.isInteger(row) || row < 0 || row >= rows) return fail("cell_none", `Table has ${rows} rows (0-based, -1 = last); row ${ref.row} does not exist.`, { path: `${ref.table}/row/${ref.row}`, current: viewBlock(table.node) });
  const rowNode = table.node.child(row);
  const cols = rowNode.childCount;
  const col = ref.col === -1 ? cols - 1 : ref.col;
  if (!Number.isInteger(col) || col < 0 || col >= cols) return fail("cell_none", `Row ${row} has ${cols} cells (0-based, -1 = last); col ${ref.col} does not exist.`, { path: `${ref.table}/row/${row}/col/${ref.col}`, current: viewBlock(table.node) });
  let pos = table.pos + 1;
  for (let r = 0; r < row; r++) pos += table.node.child(r).nodeSize;
  pos += 1;
  for (let c = 0; c < col; c++) pos += rowNode.child(c).nodeSize;
  return { pos, node: rowNode.child(col), row, col, table };
}

/** The quoted words "as they stand". Ambiguity is an error: say which occurrence with nth (1-based). */
export function resolveFind(doc: Node, t: Extract<Target, { kind: "find" }>): { from: number; to: number } {
  if (!t.text) fail("bad_request", "find.text is empty.");
  if (t.text.includes(OBJ)) fail("bad_request", "find.text cannot contain chips. Quote the words around them.");
  let scopeFrom = 0, scopeTo = doc.content.size;
  if (t.within) { const c = resolveCell(doc, t.within); scopeFrom = c.pos; scopeTo = c.pos + c.node.nodeSize; }
  const matches: { from: number; to: number }[] = [];
  doc.nodesBetween(scopeFrom, scopeTo, (node, pos) => {
    if (!node.isTextblock) return true;
    if (pos < scopeFrom || pos + node.nodeSize > scopeTo) return false;
    const { text, pos: map } = textMap(node, pos);
    let i = text.indexOf(t.text);
    while (i >= 0) {
      matches.push({ from: map[i]!, to: map[i + t.text.length - 1]! + 1 });
      i = text.indexOf(t.text, i + t.text.length);
    }
    return false;
  });
  if (matches.length === 0) return fail("find_none", `"${t.text.slice(0, 60)}" is not in the ${t.within ? "cell" : "document"}. Someone may have changed it: re-read the block and quote what is there now.`);
  if (t.nth !== undefined) {
    if (!Number.isInteger(t.nth) || t.nth < 1) fail("bad_request", "nth is 1-based.");
    if (t.nth > matches.length) return fail("char_gone", `"${t.text.slice(0, 60)}" now occurs ${matches.length} time(s); occurrence ${t.nth} is gone. Re-read and re-aim.`);
    return matches[t.nth - 1]!;
  }
  if (matches.length > 1) return fail("bad_request", `"${t.text.slice(0, 60)}" occurs ${matches.length} times. Pass nth (1-based) or quote more words.`);
  return matches[0]!;
}
