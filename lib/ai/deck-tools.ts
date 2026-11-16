/* The tools the model has on a deck, and the code that carries each call out. As with docs, the model never writes
   into the deck itself: each call is one change, made as the asking person, with their role checked first. The model
   chooses a layout and the words; the layout and the design system decide where things go and how they look. */
import { addSlide, deckOutline, deleteSlide, layOutDeck, moveSlide, replaceSlideText, setDeckTitle, setNotes, slideDetail, writeSlide, type DeckResult, type DeckUndo } from "@/lib/deck/edit";
import { LAYOUTS, slideTitle, slideVersion, type Layout, type SlideContent } from "@/lib/deck/types";
import { loadDeck, writeDeck } from "@/lib/deck/ydeck";
import type { Deck } from "@/lib/deck/types";
import { canEdit, type Data, type Question, type Tab } from "@/lib/data/types";
import type { RoomStore } from "@/lib/rooms/types";
import { invalid, questionsFrom, type ToolOutcome } from "./tools";
import type { RunEvent, ToolDef } from "./types";

const str = (description: string) => ({ type: "string", description });
const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", properties, required, additionalProperties: false });
const layouts = LAYOUTS.filter((l) => l !== "blank");
const LAYOUT = { type: "string", enum: layouts, description: "title: opening slide (title, subtitle). section: a break between parts (title, subtitle). bullets: a title and three to five points (title, body). two-column: a comparison (title, left, right). quote: one sentence that matters (quote, attribution). big-number: one figure (number, label, body). closing: the ask or next steps (title, body)." };
const CONTENT = {
  title: str("The slide's title: what the audience should take away, in under ten words"),
  subtitle: str("For title and section slides"),
  body: str('The points, one per line, each starting with "- ". Three to five lines, a few words each.'),
  left: str("For two-column: the left column, same form as body"), right: str("For two-column: the right column"),
  quote: str("For quote: the sentence"), attribution: str("For quote: who said it"),
  number: str('For big-number: the figure, e.g. "14%" or "3 weeks"'), label: str("For big-number: what the figure measures"),
};
const NOTES = str("Speaker notes: what the presenter says on this slide, in two to four spoken sentences. Not a copy of the slide.");

export const DECK_TOOLS: ToolDef[] = [
  { name: "ask_questions", description: "Ask the person one to three short questions before drafting a new deck. The run pauses until they answer or skip.",
    input: obj({ questions: { type: "array", minItems: 1, maxItems: 3, items: obj({ id: str("A short key, e.g. audience"), prompt: str("The question"), options: { type: "array", maxItems: 4, items: { type: "string" }, description: "Likely answers the person can pick" } }, ["id", "prompt"]) } }, ["questions"]) },
  { name: "lay_out_deck", description: "Plan a new deck on an empty deck: its title and its slides, in order. Each slide appears as a placeholder. Returns the id of each.",
    input: obj({ title: str("The deck's title"), slides: { type: "array", minItems: 1, maxItems: 30, items: obj({ layout: LAYOUT, title: str("The slide's working title"), intent: str("One line: what this slide will say") }, ["layout", "title", "intent"]) } }, ["title", "slides"]) },
  { name: "write_slide", description: "Write one planned slide and its speaker notes. Call once per slide, in order.",
    input: obj({ slide_id: str("The slide id from lay_out_deck"), layout: LAYOUT, ...CONTENT, notes: NOTES }, ["slide_id", "layout", "notes"]) },
  { name: "read_deck", description: '"outline" lists every slide as N. [id vVERSION] layout: title. "slide" returns one slide in full, with its notes.',
    input: obj({ view: { type: "string", enum: ["outline", "slide"] }, slide_id: str("For view slide") }, ["view"]) },
  { name: "update_slide", description: "Rewrite one existing slide: its layout and words are replaced, so anything a person moved by hand on it is laid out again. For a small wording change use replace_text instead. Notes stay as they are unless you give new ones.",
    input: obj({ slide_id: str("The slide's id"), version: str("The slide's version from read_deck, so a person's newer edit is never overwritten"), layout: LAYOUT, ...CONTENT, notes: NOTES }, ["slide_id", "version", "layout"]) },
  { name: "replace_text", description: "Change some words on one slide and keep everything else on it, positions included.",
    input: obj({ slide_id: str("The slide's id"), find: str("The words exactly as they stand now"), replace_with: str("The new words") }, ["slide_id", "find", "replace_with"]) },
  { name: "set_notes", description: "Write or replace the speaker notes of one slide. The slide itself does not change.", input: obj({ slide_id: str("The slide's id"), notes: NOTES }, ["slide_id", "notes"]) },
  { name: "add_slide", description: "Add a new slide after a slide, or at the end.", input: obj({ after_slide_id: str("Insert after this slide. Omit to add at the end."), layout: LAYOUT, ...CONTENT, notes: NOTES }, ["layout", "notes"]) },
  { name: "delete_slide", description: "Remove one slide.", input: obj({ slide_id: str("The slide's id"), version: str("The slide's version from read_deck") }, ["slide_id", "version"]) },
  { name: "move_slide", description: "Move a slide to a new place in the deck.", input: obj({ slide_id: str("The slide's id"), position: { type: "integer", minimum: 1, description: "Its new number, counting from 1" } }, ["slide_id", "position"]) },
  { name: "set_title", description: "Change the deck's title.", input: obj({ title: str("The new title") }, ["title"]) },
];

export type DeckCtx = {
  data: Data; rooms: RoomStore; userId: string; artifactId: string; tab: Tab; runId: string;
  undo: DeckUndo[]; emit: (e: RunEvent) => void;
  slides: { id: string; title: string }[]; written: number; asked?: Question[];
};

export async function currentDeck(rooms: RoomStore, tab: Tab) {
  const state = await rooms.read(tab.room);
  if (!state) throw new Error("The deck could not be opened.");
  return loadDeck(state);
}
/** One change to the deck: check the person may still edit, read the newest state, apply, send only the difference. */
export async function changeDeck(ctx: DeckCtx, fn: (deck: Deck) => DeckResult): Promise<DeckResult> {
  if (!canEdit(await ctx.data.roleOn(ctx.userId, ctx.artifactId))) return { ok: false, message: "This person can no longer edit this deck, so nothing was changed. Stop here." };
  const { ydoc, deck } = await currentDeck(ctx.rooms, ctx.tab);
  const res = fn(deck);
  if (!res.ok) return res;
  if (res.undo.length === 0) return res;
  await ctx.rooms.apply(ctx.tab.room, writeDeck(ydoc, res.deck, `ai:${ctx.runId}`), `ai:${ctx.runId}`);
  ctx.undo.push(...res.undo);
  await ctx.data.updateRun(ctx.runId, { undo: ctx.undo });
  return res;
}
const told = (r: DeckResult, done: string): ToolOutcome =>
  r.ok ? { content: `${done} ${r.changed.map((s) => `[${s.id} v${slideVersion(s)}]`).join(" ")}`.trim() } : { content: r.message + (r.current ? `\n${r.current}` : ""), isError: true };
const text = (v: unknown, max = 4000) => (typeof v === "string" ? v.slice(0, max) : "");
const contentOf = (input: Record<string, unknown>): SlideContent => ({
  layout: (layouts as readonly string[]).includes(String(input.layout)) ? (input.layout as Layout) : "bullets",
  title: text(input.title, 200), subtitle: text(input.subtitle, 300), body: text(input.body), left: text(input.left), right: text(input.right),
  quote: text(input.quote, 500), attribution: text(input.attribution, 200), number: text(input.number, 20), label: text(input.label, 200),
});

export async function runDeckTool(ctx: DeckCtx, name: string, input: Record<string, unknown>): Promise<ToolOutcome> {
  const def = DECK_TOOLS.find((t) => t.name === name);
  if (!def) return { content: `There is no tool called ${name}.`, isError: true };
  const bad = invalid(def.input, input);
  if (bad) return { content: JSON.stringify({ INVALID_JSON: JSON.stringify(input), problem: bad }), isError: true };
  switch (name) {
    case "ask_questions": {
      const questions = questionsFrom(input);
      if (questions.length === 0) return { content: "Give at least one question with a prompt.", isError: true };
      ctx.asked = questions;
      return { content: "The questions are shown to the person. Wait for their answers." };
    }
    case "lay_out_deck": {
      const slides = (Array.isArray(input.slides) ? input.slides : []).map((s) => { const o = s as Record<string, unknown>; return { layout: contentOf(o).layout, title: text(o.title, 200), intent: text(o.intent, 300) }; });
      const res = await changeDeck(ctx, (d) => layOutDeck(d, { title: text(input.title, 200), slides }));
      if (!res.ok) return told(res, "");
      ctx.slides = res.deck.slides.map((s) => ({ id: s.id, title: slideTitle(s) })); ctx.written = 0;
      ctx.emit({ type: "progress", label: `Outlined ${ctx.slides.length} slide${ctx.slides.length === 1 ? "" : "s"}`, done: true });
      return { content: `Laid out. Write each slide with write_slide:\n${res.deck.slides.map((s) => `slide_id ${s.id}: ${s.layout} | ${slideTitle(s)}`).join("\n")}` };
    }
    case "write_slide": {
      const id = text(input.slide_id, 40);
      const i = ctx.slides.findIndex((s) => s.id === id);
      const label = i >= 0 ? `Drafting slide ${i + 1} of ${ctx.slides.length}: ${ctx.slides[i]!.title}` : "Drafting a slide";
      ctx.emit({ type: "progress", label });
      await ctx.data.updateRun(ctx.runId, { section: i >= 0 ? `slide ${i + 1}` : undefined });
      const res = await changeDeck(ctx, (d) => writeSlide(d, id, contentOf(input), text(input.notes)));
      if (res.ok) ctx.written++;
      ctx.emit({ type: "progress", label: res.ok ? label.replace("Drafting", "Drafted") : "Skipped a slide a person removed", done: true });
      return told(res, "Written.");
    }
    case "read_deck": {
      const { deck } = await currentDeck(ctx.rooms, ctx.tab);
      if (input.view === "slide") { const i = deck.slides.findIndex((s) => s.id === text(input.slide_id, 40)); return { content: i < 0 ? "That slide is not in the deck. Read the outline." : slideDetail(deck.slides[i]!, i + 1) }; }
      return { content: `Deck title: ${deck.title || "(none)"}\n${deckOutline(deck)}` };
    }
    case "update_slide": return told(await changeDeck(ctx, (d) => writeSlide(d, text(input.slide_id, 40), contentOf(input), typeof input.notes === "string" ? text(input.notes) : undefined, text(input.version, 20) || "missing")), "Rewritten.");
    case "replace_text": return told(await changeDeck(ctx, (d) => replaceSlideText(d, text(input.slide_id, 40), text(input.find, 2000), text(input.replace_with, 2000))), "Changed.");
    case "set_notes": return told(await changeDeck(ctx, (d) => setNotes(d, text(input.slide_id, 40), text(input.notes))), "Notes written.");
    case "add_slide": return told(await changeDeck(ctx, (d) => addSlide(d, input.after_slide_id ? text(input.after_slide_id, 40) : null, contentOf(input), text(input.notes))), "Added.");
    case "delete_slide": return told(await changeDeck(ctx, (d) => deleteSlide(d, text(input.slide_id, 40), text(input.version, 20) || "missing")), "Removed.");
    case "move_slide": return told(await changeDeck(ctx, (d) => moveSlide(d, text(input.slide_id, 40), Number(input.position))), "Moved.");
    case "set_title": return told(await changeDeck(ctx, (d) => setDeckTitle(d, text(input.title, 200))), "Title set.");
    default: return { content: `There is no tool called ${name}.`, isError: true };
  }
}
