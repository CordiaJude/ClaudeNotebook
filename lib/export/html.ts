/* A document as one self-contained HTML page, for printing to PDF. Everything is escaped; only safe link targets are kept. */
import type { Mark, Node } from "prosemirror-model";
import { isCellColor, isSafeHref } from "@/lib/editor/constants";
import { TOKENS } from "@/lib/tokens.generated";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function inline(n: Node): string {
  let out = "";
  n.forEach((c) => {
    if (c.type.name === "hardBreak") { out += "<br>"; return; }
    if (!c.isText) return;
    let t = esc(c.text ?? "");
    const has = (name: string) => c.marks.some((m: Mark) => m.type.name === name);
    if (has("code")) t = `<code>${t}</code>`;
    if (has("bold")) t = `<strong>${t}</strong>`;
    if (has("italic")) t = `<em>${t}</em>`;
    if (has("underline")) t = `<u>${t}</u>`;
    if (has("strike")) t = `<s>${t}</s>`;
    if (has("highlight")) t = `<mark>${t}</mark>`;
    const link = c.marks.find((m: Mark) => m.type.name === "link");
    if (link && isSafeHref(String(link.attrs.href ?? ""))) t = `<a href="${esc(String(link.attrs.href))}">${t}</a>`;
    out += t;
  });
  return out;
}
function block(n: Node): string {
  const kids = () => { let s = ""; n.forEach((c) => { s += block(c); }); return s; };
  switch (n.type.name) {
    case "title": return n.textContent ? `<h1 class="title">${inline(n)}</h1>` : "";
    case "heading": return `<h${Number(n.attrs.level) + 1}>${inline(n)}</h${Number(n.attrs.level) + 1}>`;
    case "paragraph": return `<p>${inline(n)}</p>`;
    case "blockquote": return `<blockquote>${kids()}</blockquote>`;
    case "horizontalRule": return "<hr>";
    case "codeBlock": return `<pre><code>${esc(n.textContent)}</code></pre>`;
    case "bulletList": return `<ul>${kids()}</ul>`;
    case "orderedList": return `<ol>${kids()}</ol>`;
    case "taskList": return `<ul class="tasks">${kids()}</ul>`;
    case "listItem": return `<li>${kids()}</li>`;
    case "taskItem": return `<li><span class="box">${n.attrs.checked ? "&#9745;" : "&#9744;"}</span><div>${kids()}</div></li>`;
    case "table": return `<table>${kids()}</table>`;
    case "tableRow": return `<tr>${kids()}</tr>`;
    case "tableHeader": case "tableCell": {
      const tag = n.type.name === "tableHeader" ? "th" : "td";
      const bg = isCellColor(n.attrs.background) ? ` style="background:${TOKENS.color.light[`tint-${n.attrs.background}` as "tint-gray"]}"` : "";
      const span = `${Number(n.attrs.colspan) > 1 ? ` colspan="${Number(n.attrs.colspan)}"` : ""}${Number(n.attrs.rowspan) > 1 ? ` rowspan="${Number(n.attrs.rowspan)}"` : ""}`;
      return `<${tag}${span}${bg}>${kids()}</${tag}>`;
    }
    default: return ""; // unwritten placeholders are not exported
  }
}

export function toHtml(doc: Node, title: string): string {
  const c = TOKENS.color.light;
  let body = "";
  doc.forEach((n) => { body += block(n); });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { size: A4; margin: 22mm 20mm; }
* { box-sizing: border-box; }
body { margin: 0; color: ${c.text}; font: 11pt/1.6 Inter, "Helvetica Neue", Arial, sans-serif; }
h1, h2, h3, h4 { font-family: Newsreader, Georgia, "Times New Roman", serif; line-height: 1.2; margin: 1.4em 0 0.4em; break-after: avoid; }
h1.title { font-size: 26pt; font-weight: 500; margin: 0 0 0.5em; }
h2 { font-size: 18pt; font-weight: 500; } h3 { font-size: 14pt; font-weight: 600; } h4 { font-size: 12pt; font-weight: 600; }
p { margin: 0.6em 0; orphans: 3; widows: 3; }
a { color: ${c.accent}; }
ul, ol { margin: 0.6em 0; padding-left: 1.4em; } li > p { margin: 0.2em 0; }
ul.tasks { list-style: none; padding-left: 0; } ul.tasks li { display: flex; gap: 0.5em; } ul.tasks li > div { flex: 1; }
blockquote { margin: 0.8em 0; padding-left: 1em; border-left: 3px solid ${c["border-input"]}; color: ${c["text-muted"]}; }
hr { border: 0; border-top: 1px solid ${c["border-input"]}; margin: 1.4em 0; }
code { font-family: "JetBrains Mono", Menlo, Consolas, monospace; font-size: 0.9em; background: ${c.sunken}; padding: 0 0.25em; border-radius: 3px; }
pre { background: ${c.sunken}; padding: 0.8em 1em; border-radius: 6px; white-space: pre-wrap; break-inside: avoid; } pre code { background: none; padding: 0; }
mark { background: ${c.highlight}; }
table { border-collapse: collapse; width: calc(100% - 2px); margin: 0.9em 1px; font-size: 10pt; break-inside: avoid; }
th, td { border: 1px solid ${c["border-input"]}; padding: 0.35em 0.6em; text-align: left; vertical-align: top; } th { background: ${c.sunken}; font-weight: 600; }
td > p, th > p { margin: 0; }
</style></head><body>${body}</body></html>`;
}
