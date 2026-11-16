/* A document as a Word file. Headings, lists, tables, links and text formatting carry over as real Word structures. */
import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel, LevelFormat, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
  type IParagraphOptions, type ParagraphChild,
} from "docx";
import type { Mark, Node } from "prosemirror-model";
import { isCellColor, isSafeHref } from "@/lib/editor/constants";
import { TOKENS } from "@/lib/tokens.generated";

const hex = (c: string) => c.replace("#", "");
const LIGHT = TOKENS.color.light;
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3] as const;

function runs(n: Node, strong = false): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  n.forEach((c) => {
    if (c.type.name === "hardBreak") { out.push(new TextRun({ break: 1 })); return; }
    if (!c.isText) return;
    const has = (name: string) => c.marks.some((m: Mark) => m.type.name === name);
    const link = c.marks.find((m: Mark) => m.type.name === "link");
    const href = link ? String(link.attrs.href ?? "") : "";
    const run = new TextRun({
      text: c.text ?? "", bold: strong || has("bold"), italics: has("italic"), strike: has("strike"),
      ...(has("underline") ? { underline: {} } : {}), ...(has("code") ? { font: "Consolas" } : {}), ...(has("highlight") ? { highlight: "yellow" as const } : {}),
      ...(href && isSafeHref(href) && /^(https?:|mailto:)/i.test(href) ? { style: "Hyperlink" } : {}),
    });
    out.push(href && isSafeHref(href) && /^(https?:|mailto:)/i.test(href) ? new ExternalHyperlink({ link: href, children: [run] }) : run);
  });
  return out;
}

type Ctx = { list?: { ordered: boolean; level: number; instance: number }; quote?: boolean; counter: { n: number } };

function blocks(n: Node, ctx: Ctx): (Paragraph | Table)[] {
  const each = (c: Ctx = ctx) => { const out: (Paragraph | Table)[] = []; n.forEach((k) => out.push(...blocks(k, c))); return out; };
  const para = (extra: IParagraphOptions = {}): Paragraph => new Paragraph({
    children: runs(n),
    ...(ctx.list ? (ctx.list.ordered ? { numbering: { reference: "numbered", level: ctx.list.level, instance: ctx.list.instance } } : { bullet: { level: ctx.list.level } }) : {}),
    ...(ctx.quote ? { indent: { left: 480 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: hex(LIGHT["border-input"]), space: 12 } } } : {}),
    ...extra,
  });
  switch (n.type.name) {
    case "title": return n.textContent ? [new Paragraph({ heading: HeadingLevel.TITLE, children: runs(n) })] : [];
    case "heading": return [new Paragraph({ heading: HEADINGS[Math.min(3, Math.max(1, Number(n.attrs.level))) - 1], children: runs(n) })];
    case "paragraph": return [para()];
    case "blockquote": return each({ ...ctx, quote: true });
    case "horizontalRule": return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: hex(LIGHT["border-input"]), space: 1 } } })];
    case "codeBlock": return n.textContent.split("\n").map((line) => new Paragraph({ children: [new TextRun({ text: line, font: "Consolas", size: 20 })], shading: { type: ShadingType.CLEAR, fill: hex(LIGHT.sunken) } }));
    case "bulletList": return each({ ...ctx, list: { ordered: false, level: ctx.list ? ctx.list.level + 1 : 0, instance: 0 } });
    case "orderedList": return each({ ...ctx, list: { ordered: true, level: ctx.list ? ctx.list.level + 1 : 0, instance: ++ctx.counter.n } });
    case "listItem": {
      // The item's first paragraph carries the bullet or number; anything after it is indented under it.
      const out: (Paragraph | Table)[] = [];
      n.forEach((k, _o, i) => out.push(...blocks(k, i === 0 || k.type.name.endsWith("List") ? ctx : { ...ctx, list: undefined })));
      return out;
    }
    case "taskList": return each({ ...ctx, list: undefined });
    case "taskItem": {
      const out: (Paragraph | Table)[] = [];
      n.forEach((k, _o, i) => {
        if (i === 0 && k.type.name === "paragraph") out.push(new Paragraph({ children: [new TextRun({ text: n.attrs.checked ? "☑ " : "☐ " }), ...runs(k)], indent: { left: 240 } }));
        else out.push(...blocks(k, ctx));
      });
      return out;
    }
    case "table": {
      const rows: TableRow[] = [];
      n.forEach((row) => {
        const cells: TableCell[] = [];
        row.forEach((cell) => {
          const head = cell.type.name === "tableHeader";
          const fill = isCellColor(cell.attrs.background) ? hex(LIGHT[`tint-${cell.attrs.background}` as "tint-gray"]) : head ? hex(LIGHT.sunken) : undefined;
          const kids: (Paragraph | Table)[] = [];
          cell.forEach((k) => kids.push(...(head && k.type.name === "paragraph" ? [new Paragraph({ children: runs(k, true), spacing: { after: 0 } })] : blocks(k, { counter: ctx.counter }))));
          cells.push(new TableCell({
            children: kids.length ? kids : [new Paragraph({})],
            ...(fill ? { shading: { type: ShadingType.CLEAR, fill } } : {}),
            ...(Number(cell.attrs.colspan) > 1 ? { columnSpan: Number(cell.attrs.colspan) } : {}), ...(Number(cell.attrs.rowspan) > 1 ? { rowSpan: Number(cell.attrs.rowspan) } : {}),
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
          }));
        });
        rows.push(new TableRow({ children: cells }));
      });
      return [new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }), new Paragraph({})];
    }
    default: return []; // unwritten placeholders are not exported
  }
}

export async function toDocx(doc: Node, title: string): Promise<Uint8Array> {
  const children: (Paragraph | Table)[] = [];
  const counter = { n: 0 };
  doc.forEach((n) => children.push(...blocks(n, { counter })));
  const file = new Document({
    title,
    creator: "Draftly",
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 }, paragraph: { spacing: { after: 140, line: 300 } } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", run: { font: "Georgia", size: 52 }, paragraph: { spacing: { after: 240 } } },
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Georgia", size: 36 }, paragraph: { spacing: { before: 360, after: 120 }, keepNext: true } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Georgia", size: 30, bold: true }, paragraph: { spacing: { before: 300, after: 100 }, keepNext: true } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Georgia", size: 24, bold: true }, paragraph: { spacing: { before: 240, after: 80 }, keepNext: true } },
      ],
    },
    numbering: { config: [{ reference: "numbered", levels: [0, 1, 2, 3].map((level) => ({ level, format: LevelFormat.DECIMAL, text: `%${level + 1}.`, alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } } })) }] },
    sections: [{ properties: { page: { margin: { top: 1247, bottom: 1247, left: 1134, right: 1134 } } }, children }],
  });
  return new Uint8Array(await Packer.toBuffer(file));
}
