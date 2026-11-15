/* A deck is a list of slides; a slide is a 1280 x 720 board of elements. Colours and fonts are never stored on an
   element: an element names a role ("accent", "heading") and the deck's design system says what that role looks like.
   That is how one change to the design system restyles every deck. */
export const SLIDE_W = 1280, SLIDE_H = 720;
export const COLOR_ROLES = ["text", "muted", "accent", "onAccent", "background", "surface"] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];
export const LAYOUTS = ["title", "section", "bullets", "two-column", "quote", "big-number", "closing", "blank"] as const;
export type Layout = (typeof LAYOUTS)[number];
export type TextRole = "title" | "heading" | "body" | "caption" | "number" | "quote";

type Box = { id: string; x: number; y: number; w: number; h: number };
/** `text` is plain text. A line that starts with "- " is a bullet; **bold** and *italic* work inside a line. */
export type TextEl = Box & { type: "text"; text: string; role: TextRole; size: number; color: ColorRole; align: "left" | "center" | "right"; valign: "top" | "middle" | "bottom" };
export type ShapeEl = Box & { type: "shape"; fill: ColorRole };
export type El = TextEl | ShapeEl;
export type Slide = {
  id: string; layout: Layout; bg: "background" | "surface" | "accent"; elements: El[]; notes: string;
  /** Set while the AI has planned this slide but not written it: one line saying what it will cover. */
  pending?: string;
};
export type Deck = { title: string; slides: Slide[] };
/** What a layout is filled with. Which fields matter depends on the layout. */
export type SlideContent = { layout: Layout; title?: string; subtitle?: string; body?: string; left?: string; right?: string; quote?: string; attribution?: string; number?: string; label?: string };

export const newId = () => Math.random().toString(36).slice(2, 10);
/** Canonical JSON: same value, same string, whatever order the keys were set in. */
export function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}
export const same = (a: unknown, b: unknown) => canon(a) === canon(b);
/** A short fingerprint of a slide, so a change made by a person since it was read is noticed. */
export function slideVersion(s: Slide): string {
  let h = 5381;
  const str = canon(s);
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
const TITLE_ROLES: TextRole[] = ["title", "heading", "quote", "number"];
/** The words a slide is known by: in the thumbnail rail, in the outline the AI reads, in conflict messages. */
export function slideTitle(s: Slide): string {
  const texts = s.elements.filter((e): e is TextEl => e.type === "text" && e.text.trim() !== "");
  const el = TITLE_ROLES.map((r) => texts.find((t) => t.role === r)).find(Boolean) ?? texts[0];
  return (el?.text.split("\n")[0] ?? "").replace(/\*+/g, "").replace(/^- /, "").trim().slice(0, 120) || "Untitled slide";
}
export const isBlankDeck = (d: Deck) => d.slides.every((s) => !s.pending && s.elements.every((e) => e.type !== "text" || e.text.trim() === "") && !s.notes.trim());
