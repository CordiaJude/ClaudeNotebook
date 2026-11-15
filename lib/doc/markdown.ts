import { MarkdownManager } from "@tiptap/markdown";
import { Fragment, type Mark, type Node } from "prosemirror-model";
import { buildExtensions } from "@/lib/editor/extensions";
import { withIds } from "./ids";
import { docSchema } from "./schema";

let mgr: MarkdownManager | null = null;
const manager = () => (mgr ??= new MarkdownManager({ extensions: buildExtensions({ history: true }) }));

/** Markdown to body blocks, each with a fresh id. Never yields a title or a draft slot: those are not the model's to write. */
export function parseMarkdown(md: string): Node[] {
  const schema = docSchema();
  const json = manager().parse(md.trim());
  const out: Node[] = [];
  for (const j of json.content ?? []) {
    if (j.type === "title" || j.type === "draftSlot") continue;
    try { const n = withIds(schema.nodeFromJSON(j)); n.check(); out.push(n); } catch { /* skip a block the schema rejects */ }
  }
  return out;
}

/** Markdown that is a single line of text, as inline content. Null when it is more than one paragraph or not a paragraph. */
export function parseInline(md: string): Fragment | null {
  const blocks = parseMarkdown(md);
  if (blocks.length === 0) return Fragment.empty;
  if (blocks.length !== 1 || blocks[0]!.type.name !== "paragraph") return null;
  return blocks[0]!.content;
}

const wrap = (text: string, marks: readonly Mark[]): string => {
  let t = text;
  const has = (n: string) => marks.some((m) => m.type.name === n);
  if (has("code")) t = "`" + t + "`";
  if (has("bold")) t = `**${t}**`;
  if (has("italic")) t = `*${t}*`;
  if (has("strike")) t = `~~${t}~~`;
  const link = marks.find((m) => m.type.name === "link");
  if (link) t = `[${t}](${link.attrs.href})`;
  return t;
};
export function inlineMarkdown(content: Fragment): string {
  let out = "";
  content.forEach((c) => { out += c.isText ? wrap(c.text ?? "", c.marks) : c.type.name === "hardBreak" ? "\n" : ""; });
  return out;
}

function block(n: Node, indent = ""): string {
  const kids = (sep = "\n") => { const a: string[] = []; n.forEach((c) => a.push(block(c, indent))); return a.join(sep); };
  switch (n.type.name) {
    case "title": return `Title: ${n.textContent}`;
    case "heading": return `${"#".repeat(Number(n.attrs.level))} ${inlineMarkdown(n.content)}`;
    case "paragraph": return indent + inlineMarkdown(n.content);
    case "blockquote": return kids("\n\n").split("\n").map((l) => `> ${l}`).join("\n");
    case "horizontalRule": return "---";
    case "codeBlock": return "```" + (n.attrs.language ?? "") + "\n" + n.textContent + "\n```";
    case "draftSlot": return `(not written yet: ${n.attrs.intent})`;
    case "bulletList": case "orderedList": case "taskList": {
      const lines: string[] = [];
      n.forEach((item, _o, i) => {
        const mark = n.type.name === "orderedList" ? `${i + 1}. ` : n.type.name === "taskList" ? `- [${item.attrs.checked ? "x" : " "}] ` : "- ";
        const parts: string[] = [];
        item.forEach((c) => parts.push(block(c, "")));
        const [first = "", ...rest] = parts.join("\n").split("\n");
        lines.push(indent + mark + first, ...rest.map((l) => indent + "  " + l));
      });
      return lines.join("\n");
    }
    case "table": {
      const rows: string[] = [];
      n.forEach((row, _o, r) => {
        const cells: string[] = [];
        row.forEach((cell) => cells.push(cell.textContent.replace(/\|/g, "\\|").replace(/\n/g, " ")));
        rows.push(`| ${cells.join(" | ")} |`);
        if (r === 0) rows.push(`| ${cells.map(() => "---").join(" | ")} |`);
      });
      return rows.join("\n");
    }
    default: return n.textContent;
  }
}
/** Blocks back to markdown, for showing the model what a document or a selection holds. */
export const toMarkdown = (nodes: readonly Node[]): string => nodes.map((n) => block(n)).join("\n\n");
