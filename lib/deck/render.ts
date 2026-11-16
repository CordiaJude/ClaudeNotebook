/* How a slide looks, in one place: the editor, the thumbnails, present mode and the exports all read these rules.
   Also builds a deck as one self-contained HTML page (for PDF, PNG and the web-page export). Everything is escaped. */
import { FONTS, type DesignSystem, type FontId } from "./design";
import { parseLines } from "./text";
import { SLIDE_H, SLIDE_W, type Deck, type Slide, type TextEl, type TextRole } from "./types";

export const LINE_HEIGHT: Record<TextRole, number> = { title: 1.1, heading: 1.15, number: 1.05, quote: 1.25, body: 1.45, caption: 1.3 };
export const usesHeadingFont = (r: TextRole) => r === "title" || r === "heading" || r === "number" || r === "quote";
export const fontOf = (el: TextEl, d: DesignSystem): FontId => (usesHeadingFont(el.role) ? d.fonts.heading : d.fonts.body);
export const weightOf = (r: TextRole) => (r === "title" || r === "heading" || r === "number" ? 600 : 400);
/** Space above a line that follows another, as a share of the font size. */
export const PARA_GAP = 0.35;
export const JUSTIFY = { top: "flex-start", middle: "center", bottom: "flex-end" } as const;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function textHtml(el: TextEl, d: DesignSystem): string {
  const lines = parseLines(el.text).map((l, i) => {
    const runs = l.runs.map((r) => { const t = esc(r.text); return r.bold ? `<strong>${t}</strong>` : r.italic ? `<em>${t}</em>` : t; }).join("") || "&nbsp;";
    const gap = i > 0 ? `margin-top:${PARA_GAP}em;` : "";
    return l.bullet ? `<p style="${gap}display:flex;gap:.55em"><span style="color:${d.colors[el.color === "onAccent" ? "onAccent" : "accent"]}">&bull;</span><span>${runs}</span></p>` : `<p style="${gap}">${runs}</p>`;
  }).join("");
  const style = `left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;justify-content:${JUSTIFY[el.valign]};font-family:${FONTS[fontOf(el, d)].css.replace(/"/g, "'")};font-size:${el.size}px;line-height:${LINE_HEIGHT[el.role]};font-weight:${weightOf(el.role)};color:${d.colors[el.color]};text-align:${el.align};${el.role === "quote" ? "font-style:italic;" : ""}`;
  return `<div class="el" style="${style}">${lines}</div>`;
}
export function slideHtml(s: Slide, d: DesignSystem): string {
  const els = s.elements.map((e) => (e.type === "shape" ? `<div class="el" style="left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.h}px;background:${d.colors[e.fill]}"></div>` : textHtml(e, d))).join("");
  return `<section class="slide" style="background:${d.colors[s.bg]}">${els}</section>`;
}
/** `fontCss` is optional @font-face CSS; without it the page falls back to Georgia and Arial. `screen` adds spacing for reading in a browser. */
export function deckHtml(deck: Deck, d: DesignSystem, opts: { fontCss?: string; only?: number; screen?: boolean } = {}): string {
  const slides = opts.only === undefined ? deck.slides : deck.slides.slice(opts.only, opts.only + 1);
  const notes = (s: Slide) => (opts.screen && s.notes ? `<aside class="notes"><strong>Speaker notes</strong><p>${esc(s.notes).replace(/\n/g, "<br>")}</p></aside>` : "");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(deck.title || "Untitled deck")}</title><style>
${opts.fontCss ?? ""}
@page { size: ${SLIDE_W}px ${SLIDE_H}px; margin: 0; }
* { box-sizing: border-box; } html, body { margin: 0; padding: 0; }
.slide { position: relative; width: ${SLIDE_W}px; height: ${SLIDE_H}px; overflow: hidden; break-after: page; }
.el { position: absolute; display: flex; flex-direction: column; overflow: hidden; }
.el p { margin: 0; }
${opts.screen ? `body { background: #1c1b19; padding: 24px 0; } .wrap { width: min(${SLIDE_W}px, 100vw - 32px); margin: 0 auto 28px; } .frame { width: 100%; aspect-ratio: 16 / 9; overflow: hidden; container-type: inline-size; } .frame .slide { transform-origin: 0 0; transform: scale(calc(100cqw / ${SLIDE_W}px)); } .notes { color: #e9e6df; font: 15px/1.5 Arial, sans-serif; padding: 10px 2px 0; } .notes p { margin: 4px 0 0; color: #bdb8ae; }` : ""}
</style></head><body>${slides.map((s) => (opts.screen ? `<div class="wrap"><div class="frame">${slideHtml(s, d)}</div>${notes(s)}</div>` : slideHtml(s, d))).join("")}</body></html>`;
}
