import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN, type DesignSystem } from "@/lib/deck/design";
import { buildSlide } from "@/lib/deck/layouts";
import { deckHtml } from "@/lib/deck/render";
import type { Deck } from "@/lib/deck/types";
import { exportDeck } from "@/lib/export";
import { repairSlideXml } from "@/lib/export/deck";

const has = (cmd: string) => { try { execFileSync("which", [cmd]); return true; } catch { return false; } };
// Set KEEP_EXPORTS to a folder to keep the files this test makes, for a look by eye.
const dir = process.env.KEEP_EXPORTS ? (mkdirSync(process.env.KEEP_EXPORTS, { recursive: true }), process.env.KEEP_EXPORTS) : mkdtempSync(path.join(tmpdir(), "deck-"));
const deck: Deck = { title: "Board update: Q1 & beyond", slides: [
  { ...buildSlide({ layout: "title", title: "Board update", subtitle: "First quarter <in five slides>" }), notes: "Open with the headline." },
  { ...buildSlide({ layout: "big-number", number: "14%", label: "Revenue growth", body: "Driven by renewals." }), notes: "Pause on the number." },
  { ...buildSlide({ layout: "bullets", title: "What changed", body: "- The launch moves to **4 March**\n- The supplier is *two weeks* late" }), notes: "" },
  { ...buildSlide({ layout: "section", title: "The plan" }), notes: "Change of pace." },
  { ...buildSlide({ layout: "two-column", title: "Options", left: "- Fix two steps", right: "- Replace the flow" }), notes: "" },
  { ...buildSlide({ layout: "quote", quote: "We lose a day every week.", attribution: "Team lead" }), notes: "" },
  { ...buildSlide({ layout: "closing", title: "Next steps", body: "- Approve the date" }), notes: "Ask for the decision." },
  { ...buildSlide({ layout: "bullets", title: "Still being written" }), pending: "not done" },
] };
const night: DesignSystem = { name: "Night", colors: { background: "#101418", surface: "#1b2229", text: "#f2f4f6", muted: "#b4bcc4", accent: "#f2b84b", onAccent: "#101418" }, fonts: { heading: "fraunces", body: "dm-sans" } };

describe("deck exports", () => {
  it("PowerPoint: one slide per written slide, editable text, design-system colours and fonts, speaker notes", async () => {
    const out = await exportDeck(deck, DEFAULT_DESIGN, "pptx", "x");
    expect(out.filename).toBe("Board update Q1 beyond.pptx");
    const file = path.join(dir, "deck.pptx");
    writeFileSync(file, out.bytes);
    execFileSync("unzip", ["-tq", file]);
    const list = execFileSync("unzip", ["-Z1", file]).toString();
    expect(list.match(/^ppt\/slides\/slide\d+\.xml$/gm)).toHaveLength(7); // the unwritten slide is left out
    const s1 = execFileSync("unzip", ["-p", file, "ppt/slides/slide1.xml"]).toString();
    expect(s1).toContain("Board update");
    expect(s1).toContain("First quarter &lt;in five slides&gt;");
    expect(s1).toContain('typeface="Newsreader"');
    expect(s1).toContain("2A5F6A"); // the accent bar
    const s3 = execFileSync("unzip", ["-p", file, "ppt/slides/slide3.xml"]).toString();
    expect(s3).toMatch(/<a:buChar/);
    // every paragraph states its settings once, first; and bullets take the accent colour
    for (const para of s3.match(/<a:p>[\s\S]*?<\/a:p>/g) ?? []) { expect(para.match(/<a:pPr\b/g)?.length ?? 0).toBeLessThanOrEqual(1); if (para.includes("<a:pPr")) expect(para.startsWith("<a:p><a:pPr")).toBe(true); }
    expect(s3).toContain('<a:buClr><a:srgbClr val="2A5F6A"/></a:buClr>');
    expect(s3).toMatch(/b="1"[^>]*>(?:(?!<a:t>).)*<a:t>4 March/s);
    const s4 = execFileSync("unzip", ["-p", file, "ppt/slides/slide4.xml"]).toString();
    expect(s4).toMatch(/<p:bg>.*2A5F6A/s);
    const notes = execFileSync("unzip", ["-p", file, "ppt/notesSlides/notesSlide2.xml"]).toString();
    expect(notes).toContain("Pause on the number.");
  });
  it("the repair keeps the first paragraph settings and drops repeats, and leaves bullets on an accent slide alone", () => {
    const run = (c: string, t: string) => `<a:r><a:rPr lang="en-US"><a:solidFill><a:srgbClr val="${c}"/></a:solidFill></a:rPr><a:t>${t}</a:t></a:r>`;
    const para = (c: string) => `<a:p><a:pPr marL="1"><a:buSzPct val="100000"/><a:buChar char="x"/></a:pPr>${run(c, "a")}<a:pPr indent="0"><a:buNone/></a:pPr>${run(c, "b")}</a:p>`;
    const fixed = repairSlideXml(para("201E1B") + para("FFFFFF") + "<a:p><a:pPr algn=\"l\"/><a:r><a:t>plain</a:t></a:r></a:p>", "2A5F6A", "FFFFFF");
    expect(fixed.match(/<a:pPr\b/g)).toHaveLength(3);
    expect(fixed).not.toContain("<a:buNone/>");
    expect(fixed.match(/<a:buClr>/g)).toHaveLength(1);
    expect(fixed).toContain('<a:p><a:pPr algn="l"/><a:r><a:t>plain</a:t></a:r></a:p>');
  });
  it("PowerPoint with basic fonts names only fonts every computer has", async () => {
    const file = path.join(dir, "deck-basic.pptx");
    writeFileSync(file, (await exportDeck(deck, night, "pptx-basic", "x")).bytes);
    const all = execFileSync("unzip", ["-p", file, "ppt/slides/slide1.xml", "ppt/slides/slide3.xml"]).toString();
    expect(all).toContain('typeface="Georgia"');
    expect(all).toContain('typeface="Arial"');
    expect(all).not.toMatch(/Fraunces|DM Sans/);
    expect(all).toContain("F2B84B");
  });
  it("the page for PDF and web escapes everything and follows the design system", () => {
    const html = deckHtml(deck, night, { screen: true });
    expect(html).toContain("First quarter &lt;in five slides&gt;");
    expect(html).not.toContain("<in five slides>");
    expect(html).toContain("background:#101418");
    expect(html).toContain("Fraunces");
    expect(html).toContain("Ask for the decision.");
    expect(deckHtml(deck, night)).not.toContain("Ask for the decision."); // notes are not printed on the PDF's slides
  });
  it("web page export is one file with the fonts inside", async () => {
    const out = await exportDeck(deck, DEFAULT_DESIGN, "html", "x");
    const html = new TextDecoder().decode(out.bytes);
    writeFileSync(path.join(dir, "deck.html"), out.bytes);
    expect(html).toContain("@font-face");
    expect(html).toContain("data:font/woff2;base64,");
    expect(html).not.toMatch(/<script|src="http|href="http/);
  });
  it.skipIf(!process.env.CHROMIUM_PATH || !existsSync(process.env.CHROMIUM_PATH))("PDF: one page per slide, 16:9, with the words in it", async () => {
    const out = await exportDeck(deck, DEFAULT_DESIGN, "pdf", "x");
    const file = path.join(dir, "deck.pdf");
    writeFileSync(file, out.bytes);
    expect(Buffer.from(out.bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    if (has("pdfinfo")) {
      const info = execFileSync("pdfinfo", [file]).toString();
      expect(info).toMatch(/Pages:\s+7/);
      expect(info).toMatch(/Page size:\s+960 x 540 pts/);
    }
    if (has("pdftotext")) expect(execFileSync("pdftotext", [file, "-"]).toString()).toContain("Revenue growth");
  }, 60_000);
});
