import type { Node } from "prosemirror-model";
import { blockHash } from "./hash";

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/** Inline content as compact text. Chips and commented words are marked so the agent can see what a rewrite would touch. */
export function inlineText(node: Node, opts: { marks?: boolean } = {}): string {
  let out = "";
  node.forEach((c) => {
    if (c.isText) {
      let t = c.text ?? "";
      if (opts.marks) {
        const names = c.marks.map((m) => m.type.name);
        if (names.includes("code")) t = "`" + t + "`";
        if (names.includes("bold")) t = `**${t}**`;
        if (names.includes("italic")) t = `*${t}*`;
        const link = c.marks.find((m) => m.type.name === "link");
        if (link) t = `[${t}](${link.attrs.href})`;
        const cm = c.marks.find((m) => m.type.name === "comment");
        if (cm) t = `<c t="${cm.attrs.threadId}">${t}</c>`;
      }
      out += t;
    } else if (c.type.name === "dateChip") out += `[date ${c.attrs.value ?? "?"}]`;
    else if (c.type.name === "mentionChip") out += c.attrs.kind === "user" ? `[@${c.attrs.label}]` : `[${c.attrs.kind} ${c.attrs.label || c.attrs.ref}]`;
    else if (c.type.name === "dropdownChip") out += `[dropdown ${c.attrs.enumId}#${c.attrs.index ?? "none"}]`;
    else if (c.isLeaf) out += "";
  });
  return out;
}

export function tagOf(n: Node): string {
  switch (n.type.name) {
    case "heading": return `h${n.attrs.level}`;
    case "paragraph": return "p";
    case "bulletList": return "ul";
    case "orderedList": return "ol";
    case "taskList": return "tasks";
    case "blockquote": return "quote";
    case "codeBlock": return "code";
    case "horizontalRule": return "hr";
    case "tableRow": return "row";
    case "listItem": return "li";
    case "taskItem": return "task";
    default: return n.type.name;
  }
}

function plainPreview(n: Node): string {
  if (n.type.name === "pending") return String(n.attrs.intent ?? "");
  if (n.type.name === "embed") return String(n.attrs.caption || n.attrs.widgetId || "");
  if (n.type.name === "byline") return `${n.attrs.asof ?? "?"} · @${n.attrs.authorName ?? "?"}`;
  if (n.isTextblock) return inlineText(n);
  let s = "";
  n.descendants((d) => { if (d.isTextblock) { s += (s ? " / " : "") + inlineText(d); return false; } return true; });
  return s;
}

export function openTag(n: Node, extra = ""): string {
  const id = n.attrs.id ? ` id="${n.attrs.id}"` : "";
  return `<${tagOf(n)}${id} h="${blockHash(n)}"${extra}>`;
}

/** One line per top-level block: id, content hash, short preview. */
export function outline(doc: Node, maxLen = 100): { text: string; hashes: Map<string, string> } {
  const hashes = new Map<string, string>();
  const lines: string[] = [];
  doc.forEach((n) => {
    if (n.attrs.id) hashes.set(n.attrs.id as string, blockHash(n));
    let extra = "";
    if (n.type.name === "table") { const r = n.childCount; extra = ` rows="${r}" cols="${n.firstChild?.childCount ?? 0}"`; }
    else if (["bulletList", "orderedList", "taskList"].includes(n.type.name)) extra = ` items="${n.childCount}"`;
    else if (n.type.name === "codeBlock") extra = ` lang="${n.attrs.language ?? ""}"`;
    lines.push(`${openTag(n, extra)}${clip(plainPreview(n), maxLen)}</${tagOf(n)}>`);
  });
  return { text: lines.join("\n"), hashes };
}

/** Full text of one block, with ids/hashes on everything the agent can address (list items, table rows and cells). */
export function viewBlock(n: Node, depth = 0): string {
  const pad = "  ".repeat(depth);
  const t = n.type.name;
  if (n.isTextblock && t !== "codeBlock") return `${pad}${openTag(n)}${inlineText(n, { marks: true })}</${tagOf(n)}>`;
  if (t === "codeBlock") return `${pad}${openTag(n, ` lang="${n.attrs.language ?? ""}"`)}\n${n.textContent}\n${pad}</code>`;
  if (t === "table") {
    const rows: string[] = [];
    n.forEach((row, _o, ri) => {
      const cells: string[] = [];
      row.forEach((cell, _o2, ci) => {
        const bg = cell.attrs.background ? ` bg=${cell.attrs.background}` : "";
        const span = (cell.attrs.colspan ?? 1) > 1 || (cell.attrs.rowspan ?? 1) > 1 ? ` span=${cell.attrs.colspan ?? 1}x${cell.attrs.rowspan ?? 1}` : "";
        const head = cell.type.name === "tableHeader" ? " th" : "";
        cells.push(`[c${ci} h=${blockHash(cell)}${head}${bg}${span}] ${inlineText(cell, { marks: true }) || cell.textContent}`);
      });
      rows.push(`${pad}  ${openTag(row, ` r="${ri}"`)}${cells.join(" | ")}</row>`);
    });
    return `${pad}${openTag(n, ` rows="${n.childCount}" cols="${n.firstChild?.childCount ?? 0}"`)}\n${rows.join("\n")}\n${pad}</table>`;
  }
  if (["bulletList", "orderedList", "taskList", "blockquote", "listItem", "taskItem"].includes(t)) {
    const inner: string[] = [];
    n.forEach((c) => inner.push(viewBlock(c, depth + 1)));
    const chk = t === "taskItem" ? ` checked="${!!n.attrs.checked}"` : "";
    return `${pad}${openTag(n, chk)}\n${inner.join("\n")}\n${pad}</${tagOf(n)}>`;
  }
  return `${pad}${openTag(n)}${clip(plainPreview(n), 200)}</${tagOf(n)}>`;
}

export type FoundHit = { blockId: string | null; topId: string | null; snippet: string };
export function searchDoc(doc: Node, text: string, max = 20): FoundHit[] {
  const needle = text.toLowerCase();
  const hits: FoundHit[] = [];
  doc.forEach((top) => {
    top.descendants((n) => {
      if (hits.length >= max) return false;
      if (!n.isTextblock) return true;
      const s = inlineText(n);
      const i = s.toLowerCase().indexOf(needle);
      if (i >= 0) hits.push({ blockId: (n.attrs.id as string) ?? null, topId: (top.attrs.id as string) ?? null, snippet: clip(s.slice(Math.max(0, i - 30)), 100) });
      return false;
    });
  });
  return hits;
}

/** Top-level blocks that changed since `last` (id -> hash from the agent's previous read). */
export function changesSince(doc: Node, last: Map<string, string>) {
  const now = new Map<string, string>();
  const changed: string[] = [];
  const added: string[] = [];
  doc.forEach((n) => {
    const id = n.attrs.id as string | undefined;
    if (!id) return;
    const h = blockHash(n);
    now.set(id, h);
    if (!last.has(id)) added.push(id);
    else if (last.get(id) !== h) changed.push(id);
  });
  const gone = [...last.keys()].filter((id) => !now.has(id));
  return { changed, added, gone, now };
}
