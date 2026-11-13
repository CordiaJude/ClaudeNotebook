import { MarkdownManager } from "@tiptap/markdown";
import type { JSONContent } from "@tiptap/core";
import { Fragment, type Node, type Schema } from "prosemirror-model";
import { buildExtensions } from "@/lib/editor/extensions";
import { fail } from "./errors";
import { assignIds } from "./ids";
import type { ChipMap } from "./types";

let mgr: MarkdownManager | null = null;
const manager = () => (mgr ??= new MarkdownManager({ extensions: buildExtensions({ onSlash: () => {}, history: true }) }));

const TOKEN = /<\?cn block ([A-Za-z0-9_-]+)\?>/g;
const SENT = /CNTK(\d+)CNTK/g;
export type ChipCtx = { me: { id: string; name: string } };

const BLOCK_CHIPS = new Set(["pending", "embed"]);

function chipNode(key: string, def: Record<string, unknown> | undefined, ctx: ChipCtx): JSONContent {
  if (!def) return fail("bad_request", `Token <?cn block ${key}?> has no entry in "blocks". Add one.`, { path: `blocks.${key}` });
  const t = def.type;
  if (t === "date" && typeof def.value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(def.value)) return { type: "dateChip", attrs: { value: def.value } };
  if (t === "mention") {
    if (def.user === "me") return { type: "mentionChip", attrs: { kind: "user", ref: ctx.me.id, label: ctx.me.name } };
    if (typeof def.user === "string") return { type: "mentionChip", attrs: { kind: "user", ref: def.user, label: String(def.label ?? def.user) } };
    if (typeof def.tab === "string") return { type: "mentionChip", attrs: { kind: "tab", ref: def.tab, label: String(def.label ?? "") } };
    if (typeof def.notebook === "string") return { type: "mentionChip", attrs: { kind: "notebook", ref: def.notebook, label: String(def.label ?? "") } };
  }
  if (t === "pending" && typeof def.intent === "string" && def.intent.trim()) return { type: "pending", attrs: { intent: def.intent.trim().slice(0, 300) } };
  if (t === "embed" && typeof def.ref === "string") return { type: "embed", attrs: { widgetId: def.ref.replace(/^widget\//, ""), caption: String(def.caption ?? "") } };
  if (t === "dropdown" && typeof def.enum === "string") return { type: "dropdownChip", attrs: { enumId: def.enum, index: typeof def.index === "number" ? def.index : null } };
  return fail("bad_request", `blocks.${key} is not a valid chip (types: date, mention, pending, embed, dropdown).`, { path: `blocks.${key}` });
}

/** Markdown (GFM + chip tokens) -> body block JSON. Never includes a `doc` wrapper. */
export function markdownToJson(md: string, blocks: ChipMap = {}, ctx: ChipCtx): { blocks: JSONContent[]; chipCount: number } {
  const keys: string[] = [];
  const text = md.replace(TOKEN, (_m, k: string) => { keys.push(k); return `CNTK${keys.length - 1}CNTK`; });
  const parsed = manager().parse(text);
  let chipCount = 0;

  const expandText = (node: JSONContent): JSONContent[] => {
    const s = node.text ?? "";
    const out: JSONContent[] = [];
    let last = 0;
    for (const m of s.matchAll(SENT)) {
      const key = keys[Number(m[1])]!;
      const chip = chipNode(key, blocks[key], ctx);
      if (BLOCK_CHIPS.has(chip.type!)) fail("bad_request", `<?cn block ${key}?> is a block-level chip; put it alone on its own line.`, { path: `blocks.${key}` });
      if (m.index! > last) out.push({ ...node, text: s.slice(last, m.index) });
      out.push(chip); chipCount++;
      last = m.index! + m[0].length;
    }
    if (last < s.length) out.push({ ...node, text: s.slice(last) });
    return out;
  };

  const walk = (nodes: JSONContent[] | undefined): JSONContent[] | undefined => {
    if (!nodes) return nodes;
    const out: JSONContent[] = [];
    for (const n of nodes) {
      if (n.type === "text" && n.text && SENT.test(n.text)) { SENT.lastIndex = 0; out.push(...expandText(n)); continue; }
      SENT.lastIndex = 0;
      if (n.type === "paragraph" && n.content?.length === 1 && n.content[0]!.type === "text") {
        const m = /^CNTK(\d+)CNTK$/.exec(n.content[0]!.text ?? "");
        if (m) {
          const key = keys[Number(m[1])]!;
          const chip = chipNode(key, blocks[key], ctx);
          if (BLOCK_CHIPS.has(chip.type!)) { out.push(chip); chipCount++; continue; }
        }
      }
      out.push(n.content ? { ...n, content: walk(n.content) } : n);
    }
    return out;
  };
  return { blocks: (walk(parsed.content) ?? []).filter((b) => b.type !== "title" && b.type !== "byline"), chipCount };
}

/** Inline text -> inline nodes (plain text; chip tokens resolve to chips). Marks come from `marks`. */
export function inlineNodes(schema: Schema, text: string, marks: readonly import("prosemirror-model").Mark[], blocks: ChipMap = {}, ctx: ChipCtx): Node[] {
  const out: Node[] = [];
  let last = 0;
  const push = (s: string) => { if (s) out.push(schema.text(s, marks)); };
  for (const m of text.matchAll(TOKEN)) {
    push(text.slice(last, m.index));
    const chip = chipNode(m[1]!, blocks[m[1]!], ctx);
    if (BLOCK_CHIPS.has(chip.type!)) fail("bad_request", `<?cn block ${m[1]}?> is a block-level chip and cannot sit inside a sentence.`);
    out.push(schema.nodeFromJSON(chip));
    last = m.index! + m[0].length;
  }
  push(text.slice(last));
  return out;
}

export function blocksFromMarkdown(schema: Schema, md: string, blocks: ChipMap | undefined, ctx: ChipCtx): { nodes: Node[]; chipCount: number } {
  const { blocks: json, chipCount } = markdownToJson(md, blocks, ctx);
  if (json.length === 0) fail("bad_request", "The markdown produced no blocks. Provide some content (to remove a block, use delete).");
  const nodes = json.map((j) => {
    try { return assignIds(schema.nodeFromJSON(j), schema); }
    catch (e) { return fail("bad_request", `Markdown produced an invalid block (${e instanceof Error ? e.message.slice(0, 120) : "schema"}).`); }
  });
  return { nodes, chipCount };
}

export const fragmentOf = (nodes: Node[]) => Fragment.from(nodes);
