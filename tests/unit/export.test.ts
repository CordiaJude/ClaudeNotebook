import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { exportDoc, fileStem } from "@/lib/export";
import { toHtml } from "@/lib/export/html";
import { makeDoc } from "./doc-helpers";

const doc = makeDoc("Q1 launch plan", "The launch moves to **4 March** because the supplier is late. See [the tracker](https://example.com/t).\n\n## Timeline\n\n| Date | Owner |\n|---|---|\n| 20 February | Priya |\n| 4 March | Jude |\n\n## Risks\n\n- A second delay\n- No slack in testing\n\n1. Confirm owners\n2. Book the review\n\n> Decide by Friday.\n\n```\nconst x = 1 < 2;\n```");
const dir = mkdtempSync(path.join(tmpdir(), "export-"));
const has = (cmd: string) => { try { execFileSync("which", [cmd]); return true; } catch { return false; } };

describe("export", () => {
  it("Markdown: title, headings, table, lists and formatting", async () => {
    const f = await exportDoc(doc, "md", "fallback");
    const md = new TextDecoder().decode(f.bytes);
    expect(f.filename).toBe("Q1 launch plan.md");
    expect(md.startsWith("# Q1 launch plan\n\nThe launch moves to **4 March**")).toBe(true);
    expect(md).toContain("[the tracker](https://example.com/t)");
    expect(md).toContain("| Date | Owner |\n| --- | --- |\n| 20 February | Priya |");
    expect(md).toContain("- A second delay");
    expect(md).toContain("1. Confirm owners\n2. Book the review");
  });

  it("Word: a valid .docx whose document holds real headings, a table, lists and the link", async () => {
    const f = await exportDoc(doc, "docx", "fallback");
    expect(f.filename).toBe("Q1 launch plan.docx");
    expect(Buffer.from(f.bytes.slice(0, 2)).toString()).toBe("PK"); // a zip container
    const file = path.join(dir, "out.docx");
    writeFileSync(file, f.bytes);
    const xml = execFileSync("unzip", ["-p", file, "word/document.xml"], { maxBuffer: 1e7 }).toString();
    expect(xml).toContain('<w:pStyle w:val="Title"/>');
    expect(xml).toContain("Q1 launch plan");
    expect(xml).toContain('<w:pStyle w:val="Heading2"/>');
    expect(xml).toMatch(/<w:tbl>[\s\S]*20 February[\s\S]*<\/w:tbl>/);
    expect((xml.match(/<w:tr>|<w:tr /g) ?? []).length).toBe(3);
    expect(xml).toContain("<w:b/>"); // bold survives
    expect(xml).toContain("<w:numPr>"); // real list numbering, not typed "1."
    expect(xml).toContain("w:hyperlink");
    expect(xml).toContain("const x = 1 &lt; 2;");
    const rels = execFileSync("unzip", ["-p", file, "word/_rels/document.xml.rels"]).toString();
    expect(rels).toContain("https://example.com/t");
    execFileSync("unzip", ["-tq", file]); // the archive is intact
  });

  it("the print page escapes content and drops unsafe links", () => {
    const evil = makeDoc("<script>alert(1)</script>", "A [bad](javascript:alert(1)) link and <b>tags</b>.");
    const html = toHtml(evil, "x");
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;b&gt;tags&lt;/b&gt;");
  });

  it("file names are safe", () => {
    expect(fileStem("Plan: Q1/Q2 <draft>")).toBe("Plan Q1Q2 draft");
    expect(fileStem("///")).toBe("Untitled");
  });

  it.skipIf(!process.env.CHROMIUM_PATH || !existsSync(process.env.CHROMIUM_PATH))("PDF: a real PDF with the document's text", async () => {
    const f = await exportDoc(doc, "pdf", "fallback");
    expect(f.filename).toBe("Q1 launch plan.pdf");
    expect(Buffer.from(f.bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(f.bytes.length).toBeGreaterThan(5000);
    if (has("pdftotext")) {
      const file = path.join(dir, "out.pdf");
      writeFileSync(file, f.bytes);
      const text = execFileSync("pdftotext", [file, "-"]).toString();
      expect(text).toContain("Q1 launch plan");
      expect(text).toContain("20 February");
      expect(text).toContain("Decide by Friday.");
    }
  }, 60_000);
});
