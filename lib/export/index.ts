import type { Node } from "prosemirror-model";
import { toMarkdown } from "@/lib/doc/markdown";
import { titleOf } from "@/lib/doc/read";
import { toDocx } from "./docx";
import { toHtml } from "./html";

export const DOC_FORMATS = ["docx", "pdf", "md"] as const;
export type DocFormat = (typeof DOC_FORMATS)[number];
export type Exported = { bytes: Uint8Array; mime: string; filename: string };

/** A safe file name from a title: letters, digits, spaces and dashes; never empty. */
export const fileStem = (title: string) => (title.normalize("NFKD").replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, " ").slice(0, 80) || "Untitled");

async function toPdf(html: string): Promise<Uint8Array> {
  const { default: puppeteer } = await import("puppeteer-core");
  // CHROMIUM_PATH points at a local browser (development, tests). Without it, the packaged serverless Chromium is used.
  const local = process.env.CHROMIUM_PATH;
  const packaged = local ? null : (await import("@sparticuz/chromium")).default;
  const browser = await puppeteer.launch({
    executablePath: local ?? (await packaged!.executablePath()),
    args: local ? ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] : packaged!.args,
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: "load" });
    return new Uint8Array(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));
  } finally { await browser.close(); }
}

export async function exportDoc(doc: Node, format: DocFormat, fallbackTitle: string): Promise<Exported> {
  const title = titleOf(doc) || fallbackTitle || "Untitled";
  const stem = fileStem(title);
  if (format === "md") {
    const body: Node[] = [];
    doc.forEach((n, _o, i) => { if (i > 0 && n.type.name !== "draftSlot") body.push(n); });
    return { bytes: new TextEncoder().encode(`# ${title}\n\n${toMarkdown(body)}\n`), mime: "text/markdown; charset=utf-8", filename: `${stem}.md` };
  }
  if (format === "docx") return { bytes: await toDocx(doc, title), mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", filename: `${stem}.docx` };
  return { bytes: await toPdf(toHtml(doc, title)), mime: "application/pdf", filename: `${stem}.pdf` };
}
