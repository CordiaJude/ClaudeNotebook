import type { Node } from "prosemirror-model";
import { fail } from "./errors";
import { blockHash } from "./hash";
import { viewBlock } from "./outline";

export const DEFAULT_ANCHOR_MARKS = ["comment", "liveblocksCommentMark"];

/** Whole-block and cell edits need the block's newest hash (spec §8.3). A pending block is exempt: nobody else owns it. */
export function requireHash(node: Node, supplied: string | Record<string, string> | undefined, label: string): void {
  if (node.type.name === "pending") return;
  const id = (node.attrs.id as string | undefined) ?? label;
  const given = typeof supplied === "string" ? supplied : supplied?.[id];
  const current = blockHash(node);
  if (!given) fail("missing_guard", `Editing ${label} needs ifHash. Its current hash is ${current}.`, { path: id, current: { h: current, view: viewBlock(node).slice(0, 1500) } });
  if (given !== current) fail("guard_mismatch", `${label} changed since you read it (someone edited it). Work from the current text below; do not retry with the old hash.`, { path: id, current: { h: current, view: viewBlock(node).slice(0, 1500) } });
}

/** Comment threads anchored on any text between from and to. */
export function anchorThreads(doc: Node, from: number, to: number, anchorMarks: string[]): string[] {
  const ids = new Set<string>();
  doc.nodesBetween(from, to, (n) => {
    if (n.isText) for (const m of n.marks) if (anchorMarks.includes(m.type.name)) ids.add(String(m.attrs.threadId ?? m.attrs.id ?? m.type.name));
    return true;
  });
  return [...ids];
}

export function requireNoAnchors(threads: string[], allowDetach: boolean | undefined, where: string): void {
  if (threads.length && !allowDetach)
    fail("anchors_affected", `${where} carries ${threads.length} comment thread(s) (${threads.join(", ")}). Narrow the edit to avoid those words, or, only if a person asked for this change, retry with allowDetach:true.`, { current: { threads } });
}

const CHIPS = new Set(["dateChip", "mentionChip", "dropdownChip", "pending", "embed"]);
export const countChips = (node: Node): number => { let n = 0; node.descendants((d) => { if (CHIPS.has(d.type.name)) n++; }); return n; };
export const chipsInRange = (nodes: Node[]) => nodes.reduce((a, n) => a + (CHIPS.has(n.type.name) ? 1 : 0) + countChips(n), 0);
