/* A deck as a file: PowerPoint (editable text boxes, speaker notes), PDF (one slide per page) or a self-contained web
   page. All three are built from the same slide model and design system the editor shows. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { FONTS, type DesignSystem, type FontId } from "@/lib/deck/design";
import { LINE_HEIGHT, PARA_GAP, deckHtml, fontOf, weightOf } from "@/lib/deck/render";
import { parseLines } from "@/lib/deck/text";
import { SLIDE_H, SLIDE_W, type Deck } from "@/lib/deck/types";

const IN = 96; // slide units per inch: 1280 x 720 is a 13.333 x 7.5 inch widescreen slide
const hex = (c: string) => c.replace("#", "").toUpperCase();

/** `basicFonts` swaps the design system's fonts for Georgia and Arial, which every computer has. */
export async function toPptx(deck: Deck, d: DesignSystem, opts: { basicFonts?: boolean } = {}): Promise<Uint8Array> {
  const { default: Pptx } = await import("pptxgenjs");
  const pptx = new Pptx();
  pptx.defineLayout({ name: "WIDE", width: SLIDE_W / IN, height: SLIDE_H / IN });
  pptx.layout = "WIDE";
  pptx.title = deck.title || "Untitled deck";
  const face = (f: FontId) => (opts.basicFonts ? FONTS[f].basic : FONTS[f].office);
  for (const s of deck.slides.filter((x) => !x.pending)) {
    const slide = pptx.addSlide();
    slide.background = { color: hex(d.colors[s.bg]) };
    for (const el of s.elements) {
      const box = { x: el.x / IN, y: el.y / IN, w: el.w / IN, h: el.h / IN };
      if (el.type === "shape") { slide.addShape("rect", { ...box, fill: { color: hex(d.colors[el.fill]) }, line: { color: hex(d.colors[el.fill]), width: 0 } }); continue; }
      if (!el.text.trim()) continue;
      const lines = parseLines(el.text);
      const runs = lines.flatMap((l, i) => {
        const parts = l.runs.length ? l.runs : [{ text: "" }];
        return parts.map((r, j) => ({
          text: r.text,
          options: {
            bold: r.bold || weightOf(el.role) >= 600, italic: r.italic || el.role === "quote",
            ...(j === 0 && l.bullet ? { bullet: { code: "2022", indent: Math.round(el.size * 0.75 * 1.1) } } : {}),
            ...(j === 0 && i > 0 ? { paraSpaceBefore: Math.round(el.size * 0.75 * PARA_GAP) } : {}),
            ...(j === parts.length - 1 && i < lines.length - 1 ? { breakLine: true } : {}),
          },
        }));
      });
      slide.addText(runs, { ...box, margin: 0, fontFace: face(fontOf(el, d)), fontSize: Math.round(el.size * 0.75 * 10) / 10, color: hex(d.colors[el.color]), align: el.align, valign: el.valign, lineSpacingMultiple: LINE_HEIGHT[el.role] / 1.2, fit: "shrink", wrap: true });
    }
    if (s.notes.trim()) slide.addNotes(s.notes);
  }
  return repair(new Uint8Array((await pptx.write({ outputType: "nodebuffer" })) as Buffer), hex(d.colors.accent), hex(d.colors.onAccent));
}

/** Fixes two things in what the PowerPoint library writes. On a line with more than one run (a bold word, say) it repeats
    the paragraph's settings before each later run, which is not valid and makes the bullet disappear; only the first
    may stay. And it has no way to colour a bullet, so the accent colour is added here (bullets on an accent slide keep the text's colour). */
export function repairSlideXml(xml: string, accent: string, onAccent: string): string {
  return xml.replace(/<a:p>[\s\S]*?<\/a:p>/g, (para) => {
    let first = true;
    let out = para.replace(/<a:pPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:pPr>)/g, (pPr) => { if (first) { first = false; return pPr; } return ""; });
    if (out.includes("<a:buChar") && !out.includes("<a:buClr>")) {
      const textColor = /<a:rPr\b[^>]*>\s*<a:solidFill><a:srgbClr val="([0-9A-F]{6})"/.exec(out)?.[1];
      if (textColor !== onAccent) out = out.replace(/<a:buSzPct\b/, `<a:buClr><a:srgbClr val="${accent}"/></a:buClr><a:buSzPct`);
    }
    return out;
  });
}
async function repair(file: Uint8Array, accent: string, onAccent: string): Promise<Uint8Array> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(file);
  for (const name of Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))) zip.file(name, repairSlideXml(await zip.file(name)!.async("string"), accent, onAccent));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/** @font-face rules with the font files inlined, so headless Chromium prints the same fonts the editor shows. Missing files are skipped. */
export async function fontCss(d: DesignSystem): Promise<string> {
  const out: string[] = [];
  for (const id of new Set([d.fonts.heading, d.fonts.body])) {
    const f = FONTS[id], family = /"([^"]+)"/.exec(f.css)?.[1] ?? f.label;
    for (const style of ["normal", "italic"] as const) {
      try {
        const file = await readFile(path.join(process.cwd(), "node_modules", "@fontsource-variable", f.dir, "files", `${f.dir}-latin-wght-${style}.woff2`));
        out.push(`@font-face{font-family:"${family}";font-style:${style};font-weight:100 900;src:url(data:font/woff2;base64,${file.toString("base64")}) format("woff2");}`);
      } catch { /* this family has no such face, or the file is not deployed: the fallback font is used */ }
    }
  }
  return out.join("\n");
}
export const deckPage = async (deck: Deck, d: DesignSystem, screen = false) => deckHtml({ ...deck, slides: deck.slides.filter((s) => !s.pending) }, d, { fontCss: await fontCss(d), screen });
