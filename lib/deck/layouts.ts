/* Layouts: where a slide's words go. The AI (and the "Layout" menu) choose a layout and give it words; this file
   places them. Sizes shrink for long text, so a long title wraps inside its box instead of running off the slide. */
import { toSlideText } from "./text";
import { newId, type El, type Layout, type ShapeEl, type Slide, type SlideContent, type TextEl } from "./types";

const M = 80, W = 1120;
/** Rough number of lines `text` takes at `size` in a box `w` wide. Average glyph width is about half the font size. */
function linesAt(text: string, size: number, w: number): number {
  return text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil((line.length * size * 0.5) / Math.max(1, w - (line.startsWith("- ") ? size * 1.2 : 0)))), 0);
}
/** The largest size from `max` down to `min` at which `text` fits in the box. */
export function fit(text: string, w: number, h: number, max: number, min: number, lineHeight = 1.3): number {
  for (let size = max; size > min; size -= 2) if (linesAt(text, size, w) * size * lineHeight <= h) return size;
  return min;
}
const t = (p: Partial<TextEl> & Pick<TextEl, "x" | "y" | "w" | "h" | "text" | "role" | "size">): TextEl => ({ id: newId(), type: "text", color: "text", align: "left", valign: "top", ...p });
const bar = (x: number, y: number, w: number, h: number, fill: ShapeEl["fill"] = "accent"): ShapeEl => ({ id: newId(), type: "shape", x, y, w, h, fill });
const line = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function buildSlide(c: SlideContent, keep?: { id?: string; notes?: string }): Slide {
  const title = line(c.title, 160), subtitle = line(c.subtitle, 200);
  const body = toSlideText(c.body ?? ""), left = toSlideText(c.left ?? "", 700), right = toSlideText(c.right ?? "", 700);
  let bg: Slide["bg"] = "background";
  const els: El[] = [];
  const heading = () => { els.push(t({ x: M, y: 56, w: W, h: 108, text: title, role: "heading", size: fit(title, W, 108, 44, 30, 1.15), valign: "bottom" }), bar(M, 180, 64, 6)); };
  switch (c.layout) {
    case "title":
      // The title sits on the bar and grows upwards, so a subtitle is always right under it however long the title is.
      els.push(t({ x: M, y: 152, w: W, h: 272, text: title, role: "title", size: fit(title, W, 272, 72, 44, 1.1), valign: "bottom" }), bar(M, 448, 96, 8));
      if (subtitle) els.push(t({ x: M, y: 484, w: 1000, h: 84, text: subtitle, role: "body", size: 28, color: "muted" }));
      break;
    case "section":
      bg = "accent";
      els.push(t({ x: M, y: 228, w: W, h: 180, text: title, role: "title", size: fit(title, W, 180, 60, 40, 1.1), color: "onAccent", valign: "bottom" }));
      if (subtitle) els.push(t({ x: M, y: 424, w: 1000, h: 80, text: subtitle, role: "body", size: 26, color: "onAccent" }));
      break;
    case "two-column":
      heading();
      els.push(t({ x: M, y: 216, w: 540, h: 432, text: left, role: "body", size: fit(left, 540, 432, 26, 18, 1.45) }), t({ x: 660, y: 216, w: 540, h: 432, text: right, role: "body", size: fit(right, 540, 432, 26, 18, 1.45) }));
      break;
    case "quote": {
      bg = "surface";
      const q = line(c.quote || c.body, 400);
      els.push(bar(M, 196, 8, 268), t({ x: 128, y: 188, w: 1040, h: 284, text: q, role: "quote", size: fit(q, 1040, 284, 44, 28, 1.25), valign: "middle" }));
      if (c.attribution) els.push(t({ x: 128, y: 492, w: 1040, h: 48, text: line(c.attribution, 120), role: "caption", size: 24, color: "muted" }));
      break;
    }
    case "big-number": {
      const n = line(c.number, 14);
      els.push(t({ x: M, y: 132, w: W, h: 232, text: n, role: "number", size: fit(n, W, 232, 176, 96, 1.05), color: "accent", valign: "bottom" }), t({ x: M, y: 380, w: W, h: 64, text: line(c.label || c.title, 120), role: "heading", size: 34 }));
      if (body) els.push(t({ x: M, y: 460, w: 1000, h: 188, text: body, role: "body", size: fit(body, 1000, 188, 24, 18, 1.45), color: "muted" }));
      break;
    }
    case "closing":
      els.push(t({ x: M, y: 112, w: W, h: 132, text: title, role: "title", size: fit(title, W, 132, 52, 36, 1.1), valign: "bottom" }), bar(M, 260, 96, 8));
      if (body) els.push(t({ x: M, y: 296, w: W, h: 344, text: body, role: "body", size: fit(body, W, 344, 28, 18, 1.45) }));
      break;
    case "blank": break;
    default:
      heading();
      els.push(t({ x: M, y: 216, w: W, h: 432, text: body, role: "body", size: fit(body, W, 432, 28, 18, 1.45) }));
  }
  return { id: keep?.id ?? newId(), layout: c.layout, bg, elements: els, notes: keep?.notes ?? "" };
}
export const LAYOUT_LABELS: Record<Layout, string> = { title: "Title", section: "Section break", bullets: "Title and points", "two-column": "Two columns", quote: "Quote", "big-number": "Big number", closing: "Closing", blank: "Blank" };

/** The reverse of buildSlide, as far as it goes: the words on a slide, so a different layout can be applied to them. */
export function contentOf(s: Slide, layout: Layout): SlideContent {
  const texts = s.elements.filter((e): e is TextEl => e.type === "text" && e.text.trim() !== "");
  const head = texts.find((e) => e.role === "title" || e.role === "heading") ?? texts.find((e) => e.role === "quote" || e.role === "number");
  const rest = texts.filter((e) => e !== head).sort((a, b) => a.y - b.y || a.x - b.x);
  const joined = rest.map((e) => e.text).join("\n");
  return { layout, title: head?.text ?? "", subtitle: rest[0]?.text, body: joined, left: rest[0]?.text ?? "", right: rest.slice(1).map((e) => e.text).join("\n"), quote: head?.role === "quote" ? head.text : (head?.text ?? joined), attribution: rest.at(-1)?.text, number: head?.role === "number" ? head.text : "", label: rest[0]?.text };
}
