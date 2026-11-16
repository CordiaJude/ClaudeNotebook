/* Every change the AI can make to a deck, as a pure function: deck in, deck out, plus what it takes to undo it.
   Each one refuses rather than overwrite something a person changed in the meantime. */
import { buildSlide } from "./layouts";
import { plain } from "./text";
import { isBlankDeck, same, slideTitle, slideVersion, type Deck, type Slide, type SlideContent, type TextEl } from "./types";

export type DeckUndo =
  | { kind: "slide"; index: number; before: Slide | null; after: Slide | null }
  | { kind: "title"; before: string; after: string }
  | { kind: "move"; id: string; from: number; to: number };
export type DeckResult = { ok: true; deck: Deck; undo: DeckUndo[]; changed: Slide[] } | { ok: false; message: string; current?: string };
export const MAX_SLIDES = 40;

const fail = (message: string, current?: string): DeckResult => ({ ok: false, message, ...(current ? { current } : {}) });
const at = (d: Deck, id: string) => d.slides.findIndex((s) => s.id === id);
const put = (d: Deck, i: number, s: Slide): Deck => ({ ...d, slides: d.slides.map((x, j) => (j === i ? s : x)) });
const gone = "That slide is not in the deck. A person may have removed it. Read the deck again.";

/** One slide in full, as the AI reads it. */
export function slideDetail(s: Slide, n: number): string {
  const texts = s.elements.filter((e): e is TextEl => e.type === "text" && e.text.trim() !== "");
  return [`Slide ${n} [${s.id} v${slideVersion(s)}] layout ${s.layout}${s.pending ? " (planned, not written)" : ""}`, ...texts.map((e) => `${e.role}: ${e.text.replace(/\n/g, "\n  ")}`), `notes: ${s.notes || "(none)"}`].join("\n");
}
export function deckOutline(d: Deck): string {
  if (d.slides.length === 0) return "The deck has no slides.";
  return d.slides.map((s, i) => `${i + 1}. [${s.id} v${slideVersion(s)}] ${s.layout}: ${slideTitle(s)}${s.pending ? " (planned, not written)" : ""}${s.notes ? "" : " (no notes)"}`).join("\n");
}
/** All the words in a deck: for search, and for the library preview. */
export const deckText = (d: Deck) => d.slides.map((s) => [...s.elements.filter((e): e is TextEl => e.type === "text").map((e) => plain(e.text)), s.notes].filter(Boolean).join("\n")).join("\n\n");

export function layOutDeck(d: Deck, plan: { title: string; slides: { layout: SlideContent["layout"]; title: string; intent: string }[] }): DeckResult {
  if (!isBlankDeck(d)) return fail("The deck already has content. Use add_slide and update_slide to change it.");
  if (plan.slides.length === 0) return fail("Plan at least one slide.");
  const slides = plan.slides.slice(0, MAX_SLIDES).map((p) => ({ ...buildSlide({ layout: p.layout, title: p.title, label: p.title, quote: p.title }), pending: p.intent || "Being written" }));
  const title = plan.title.trim().slice(0, 200) || d.title;
  const undo: DeckUndo[] = [...d.slides.map((s): DeckUndo => ({ kind: "slide", index: 0, before: s, after: null })), ...slides.map((s, i): DeckUndo => ({ kind: "slide", index: i, before: null, after: s }))];
  if (title !== d.title) undo.push({ kind: "title", before: d.title, after: title });
  return { ok: true, deck: { title, slides }, undo, changed: slides };
}
/** Fill a planned slide, or rewrite a slide. With `version`, refuses when a person changed the slide since it was read. */
export function writeSlide(d: Deck, id: string, content: SlideContent, notes: string | undefined, version?: string): DeckResult {
  const i = at(d, id);
  if (i < 0) return fail(gone);
  const cur = d.slides[i]!;
  if (version && slideVersion(cur) !== version) return fail("A person changed this slide after you read it. Their change stays. Work from the current slide:", slideDetail(cur, i + 1));
  const next = buildSlide(content, { id, notes: (notes ?? cur.notes).trim().slice(0, 4000) });
  return { ok: true, deck: put(d, i, next), undo: [{ kind: "slide", index: i, before: cur, after: next }], changed: [next] };
}
export function addSlide(d: Deck, afterId: string | null, content: SlideContent, notes: string): DeckResult {
  if (d.slides.length >= MAX_SLIDES) return fail(`A deck holds at most ${MAX_SLIDES} slides.`);
  const after = afterId ? at(d, afterId) : d.slides.length - 1;
  if (afterId && after < 0) return fail(gone);
  const s = buildSlide(content, { notes: notes.trim().slice(0, 4000) });
  const slides = [...d.slides.slice(0, after + 1), s, ...d.slides.slice(after + 1)];
  return { ok: true, deck: { ...d, slides }, undo: [{ kind: "slide", index: after + 1, before: null, after: s }], changed: [s] };
}
export function deleteSlide(d: Deck, id: string, version?: string): DeckResult {
  const i = at(d, id);
  if (i < 0) return fail(gone);
  if (version && slideVersion(d.slides[i]!) !== version) return fail("A person changed this slide after you read it, so it was not removed. Current slide:", slideDetail(d.slides[i]!, i + 1));
  return { ok: true, deck: { ...d, slides: d.slides.filter((_, j) => j !== i) }, undo: [{ kind: "slide", index: i, before: d.slides[i]!, after: null }], changed: [] };
}
/** `position` counts from 1. */
export function moveSlide(d: Deck, id: string, position: number): DeckResult {
  const from = at(d, id);
  if (from < 0) return fail(gone);
  const to = Math.max(0, Math.min(d.slides.length - 1, Math.round(position) - 1));
  if (to === from) return { ok: true, deck: d, undo: [], changed: [] };
  const slides = [...d.slides];
  const [s] = slides.splice(from, 1);
  slides.splice(to, 0, s!);
  return { ok: true, deck: { ...d, slides }, undo: [{ kind: "move", id, from, to }], changed: [s!] };
}
export function setNotes(d: Deck, id: string, notes: string): DeckResult {
  const i = at(d, id);
  if (i < 0) return fail(gone);
  const next = { ...d.slides[i]!, notes: notes.trim().slice(0, 4000) };
  return { ok: true, deck: put(d, i, next), undo: [{ kind: "slide", index: i, before: d.slides[i]!, after: next }], changed: [next] };
}
/** Change some words on a slide and leave everything else, positions included, as it is. */
export function replaceSlideText(d: Deck, id: string, find: string, replaceWith: string): DeckResult {
  const i = at(d, id);
  if (i < 0) return fail(gone);
  if (!find) return fail("Say which words to change.");
  const cur = d.slides[i]!;
  const hit = cur.elements.find((e) => e.type === "text" && e.text.includes(find)) as TextEl | undefined;
  if (!hit) return fail("Those words are not on this slide as written. Current slide:", slideDetail(cur, i + 1));
  const next = { ...cur, elements: cur.elements.map((e) => (e === hit ? { ...hit, text: hit.text.replace(find, () => replaceWith) } : e)) };
  return { ok: true, deck: put(d, i, next), undo: [{ kind: "slide", index: i, before: cur, after: next }], changed: [next] };
}
export function setDeckTitle(d: Deck, title: string): DeckResult {
  const t = title.trim().slice(0, 200);
  if (!t) return fail("A title cannot be empty.");
  return { ok: true, deck: { ...d, title: t }, undo: t === d.title ? [] : [{ kind: "title", before: d.title, after: t }], changed: [] };
}
/** Slides the AI planned but never wrote. Removed when a run stops early, so no half-made slide is left behind. */
export function dropPending(d: Deck): Deck {
  return d.slides.some((s) => s.pending) ? { ...d, slides: d.slides.filter((s) => !s.pending) } : d;
}

/** Put back everything a run changed, newest change first. Anything a person has changed since is named, and kept unless `force`. */
export function undoDeck(d: Deck, entries: DeckUndo[], opts: { force?: boolean } = {}): { ok: true; deck: Deck } | { ok: false; conflicts: string[] } {
  let deck = d;
  const conflicts: string[] = [];
  for (const e of [...entries].reverse()) {
    if (e.kind === "title") { if (deck.title === e.after || opts.force) deck = { ...deck, title: e.before }; else conflicts.push("The deck's title was changed"); continue; }
    if (e.kind === "move") {
      const i = at(deck, e.id);
      if (i < 0) continue;
      const slides = [...deck.slides]; const [s] = slides.splice(i, 1); slides.splice(Math.min(e.from, slides.length), 0, s!);
      deck = { ...deck, slides };
      continue;
    }
    const id = (e.after ?? e.before)!.id;
    const i = at(deck, id);
    if (e.after) {
      if (i < 0) { if (e.before && opts.force) deck = { ...deck, slides: [...deck.slides.slice(0, e.index), e.before, ...deck.slides.slice(e.index)] }; else if (e.before) conflicts.push(`“${slideTitle(e.after)}” was deleted`); continue; }
      if (!same(deck.slides[i], e.after) && !opts.force) { conflicts.push(`Slide ${i + 1}, “${slideTitle(deck.slides[i]!)}”, was edited`); continue; }
      deck = e.before ? put(deck, i, e.before) : { ...deck, slides: deck.slides.filter((_, j) => j !== i) };
    } else if (i < 0 && e.before) {
      const k = Math.min(e.index, deck.slides.length);
      deck = { ...deck, slides: [...deck.slides.slice(0, k), e.before, ...deck.slides.slice(k)] };
    }
  }
  return conflicts.length ? { ok: false, conflicts: [...new Set(conflicts)] } : { ok: true, deck };
}
