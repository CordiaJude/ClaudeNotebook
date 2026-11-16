import { beforeEach, describe, expect, it } from "vitest";
import { runSelectionEdit, startChatRun, undoRun, type Deps } from "@/lib/ai/run";
import { scriptedModel } from "@/lib/ai/scripted";
import type { Model, RunEvent } from "@/lib/ai/types";
import { DEMO, grantForTest, memoryData, resetMemory } from "@/lib/data/memory";
import type { Message, User } from "@/lib/data/types";
import { DEFAULT_DESIGN, checkContrast, contrast, validateDesign } from "@/lib/deck/design";
import { addSlide, deleteSlide, layOutDeck, moveSlide, replaceSlideText, setNotes, undoDeck, writeSlide, type DeckUndo } from "@/lib/deck/edit";
import { buildSlide, fit } from "@/lib/deck/layouts";
import { parseLines, toSlideText } from "@/lib/deck/text";
import { SLIDE_H, SLIDE_W, same, slideTitle, slideVersion, type Deck, type TextEl } from "@/lib/deck/types";
import { initialDeckUpdate, loadDeck, writeDeck } from "@/lib/deck/ydeck";
import { localRooms } from "@/lib/rooms/local";
import * as Y from "yjs";

const fast = scriptedModel({ wordMs: 0, toolMs: 0 });
async function drain(stream: ReadableStream<Uint8Array>): Promise<RunEvent[]> {
  const out: RunEvent[] = [], dec = new TextDecoder(), reader = stream.getReader();
  let buf = "";
  for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); for (let i = buf.indexOf("\n\n"); i >= 0; i = buf.indexOf("\n\n")) { const l = buf.slice(0, i); buf = buf.slice(i + 2); if (l.startsWith("data: ")) out.push(JSON.parse(l.slice(6))); } }
  return out;
}
let me: User, deps: Deps;
const roomOf = async (id: string, as = me) => (await memoryData.getArtifact(as.id, id))!.tabs[0]!.room;
const deckOf = async (id: string) => loadDeck(await localRooms.read(await roomOf(id))).deck;
const newDeck = async () => (await memoryData.createArtifact(me.id, { kind: "deck" })).artifact.id;
const runIdOf = (ev: RunEvent[]) => (ev.find((e) => e.type === "start") as { runId: string }).runId;
/** Ask, answer the questions, and return the events of the drafting run. */
async function draft(id: string, d = deps) {
  const first = await drain(await startChatRun({ artifactId: id, message: "Make a deck about moving our weekly meeting to async updates" }, d));
  const asked = (first.filter((e) => e.type === "message").at(-1) as { message: Message }).message;
  return { first, asked, ev: await drain(await startChatRun({ artifactId: id, answers: { messageId: asked.id, values: { audience: "Leadership", length: "About 5 slides" } } }, d)) };
}
beforeEach(async () => { resetMemory(); me = await memoryData.signIn(DEMO); deps = { user: me, data: memoryData, rooms: localRooms, model: fast }; });

describe("layouts keep words on the slide", () => {
  it("every layout places its elements inside the slide", () => {
    for (const layout of ["title", "section", "bullets", "two-column", "quote", "big-number", "closing"] as const) {
      const s = buildSlide({ layout, title: "A title", subtitle: "Sub", body: "- one\n- two", left: "- a", right: "- b", quote: "Q", attribution: "Me", number: "14%", label: "Growth" });
      expect(s.elements.length).toBeGreaterThan(0);
      for (const e of s.elements) { expect(e.x).toBeGreaterThanOrEqual(0); expect(e.y).toBeGreaterThanOrEqual(0); expect(e.x + e.w).toBeLessThanOrEqual(SLIDE_W); expect(e.y + e.h).toBeLessThanOrEqual(SLIDE_H); }
    }
  });
  it("a long title gets a smaller size instead of overflowing", () => {
    const short = buildSlide({ layout: "title", title: "Short" }).elements.find((e) => e.type === "text") as TextEl;
    const long = buildSlide({ layout: "title", title: "A very long title that goes on and on about the quarterly numbers and what they mean for every team in the company this year" }).elements.find((e) => e.type === "text") as TextEl;
    expect(long.size).toBeLessThan(short.size);
    expect(fit("x".repeat(400), 1120, 100, 44, 30)).toBe(30);
  });
  it("model markdown is reduced to slide text", () => {
    expect(toSlideText("## Heading\n\n* one\n2. two\n> three")).toBe("Heading\n\n- one\n- two\nthree");
    expect(parseLines("- **Bold** and *soft*")[0]).toEqual({ bullet: true, runs: [{ text: "Bold", bold: true }, { text: " and " }, { text: "soft", italic: true }] });
  });
});

describe("deck edits and their undo", () => {
  const base = (): Deck => ({ title: "", slides: [] });
  const laid = () => { const r = layOutDeck(base(), { title: "Plan", slides: [{ layout: "title", title: "Plan", intent: "open" }, { layout: "bullets", title: "Points", intent: "three points" }] }); if (!r.ok) throw new Error(r.message); return r; };
  it("lays out placeholders only on an empty deck", () => {
    const r = laid();
    expect(r.deck.slides.map((s) => s.pending)).toEqual(["open", "three points"]);
    expect(layOutDeck(r.deck, { title: "X", slides: [{ layout: "title", title: "X", intent: "" }] }).ok).toBe(false);
  });
  it("writing a slide fills it, sets notes and clears the placeholder", () => {
    const r = laid(), id = r.deck.slides[1]!.id;
    const w = writeSlide(r.deck, id, { layout: "bullets", title: "Three points", body: "- a\n- b" }, "Say this.");
    expect(w.ok && w.deck.slides[1]).toMatchObject({ id, notes: "Say this." });
    expect(w.ok && w.deck.slides[1]!.pending).toBeUndefined();
    expect(w.ok && slideTitle(w.deck.slides[1]!)).toBe("Three points");
  });
  it("refuses to rewrite or delete a slide a person changed since it was read", () => {
    const r = laid(), s = r.deck.slides[1]!;
    const v = slideVersion(s);
    const human: Deck = { ...r.deck, slides: [r.deck.slides[0]!, { ...s, notes: "typed by a person" }] };
    const w = writeSlide(human, s.id, { layout: "bullets", title: "X" }, undefined, v);
    expect(w.ok).toBe(false);
    expect(!w.ok && w.current).toContain("typed by a person");
    expect(deleteSlide(human, s.id, v).ok).toBe(false);
    expect(deleteSlide(human, s.id, slideVersion(human.slides[1]!)).ok).toBe(true);
  });
  it("replace_text changes the words and nothing else", () => {
    const d: Deck = { title: "T", slides: [buildSlide({ layout: "bullets", title: "Revenue", body: "- up 14%" })] };
    const r = replaceSlideText(d, d.slides[0]!.id, "14%", "16%");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const before = d.slides[0]!.elements, after = r.deck.slides[0]!.elements;
    expect(after.map((e) => ({ ...e, ...(e.type === "text" ? { text: "" } : {}) }))).toEqual(before.map((e) => ({ ...e, ...(e.type === "text" ? { text: "" } : {}) })));
    expect((after.find((e) => e.type === "text" && e.role === "body") as TextEl).text).toBe("- up 16%");
    expect(replaceSlideText(d, d.slides[0]!.id, "not there", "x").ok).toBe(false);
  });
  it("undo puts back a whole run, newest change first", () => {
    const start: Deck = { title: "T", slides: [buildSlide({ layout: "title", title: "One" }), buildSlide({ layout: "bullets", title: "Two", body: "- a" })] };
    const undo: DeckUndo[] = [];
    let d = start;
    for (const step of [(x: Deck) => addSlide(x, null, { layout: "closing", title: "Three" }, "n"), (x: Deck) => setNotes(x, start.slides[0]!.id, "hello"), (x: Deck) => moveSlide(x, start.slides[1]!.id, 1), (x: Deck) => deleteSlide(x, start.slides[0]!.id)]) {
      const r = step(d); if (!r.ok) throw new Error(r.message); d = r.deck; undo.push(...r.undo);
    }
    expect(d.slides.map(slideTitle)).toEqual(["Two", "Three"]);
    const back = undoDeck(d, undo);
    expect(back.ok && same(back.deck, start)).toBe(true);
  });
  it("undo names what a person changed since, and only overwrites it when told to", () => {
    const start: Deck = { title: "T", slides: [buildSlide({ layout: "bullets", title: "Two", body: "- a" })] };
    const r = setNotes(start, start.slides[0]!.id, "ai notes"); if (!r.ok) throw new Error();
    const human: Deck = { ...r.deck, slides: [{ ...r.deck.slides[0]!, notes: "my own notes" }] };
    const res = undoDeck(human, r.undo);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.conflicts[0]).toMatch(/Slide 1, “Two”, was edited/);
    const forced = undoDeck(human, r.undo, { force: true });
    expect(forced.ok && same(forced.deck, start)).toBe(true);
  });
});

describe("a deck in a live document", () => {
  it("round-trips, and only sends what changed", () => {
    const deck: Deck = { title: "T", slides: [buildSlide({ layout: "bullets", title: "One", body: "- a" }), buildSlide({ layout: "closing", title: "Two" })] };
    const { ydoc, deck: read } = loadDeck(initialDeckUpdate(deck));
    expect(same(read, deck)).toBe(true);
    const full = Y.encodeStateAsUpdate(ydoc).byteLength;
    const el = deck.slides[0]!.elements[0]!;
    const moved: Deck = { ...deck, slides: [{ ...deck.slides[0]!, elements: [{ ...el, x: el.x + 10 }, ...deck.slides[0]!.elements.slice(1)] }, deck.slides[1]!] };
    const diff = writeDeck(ydoc, moved, "t");
    expect(diff.byteLength).toBeLessThan(full / 4);
    expect(same(loadDeck(Y.encodeStateAsUpdate(ydoc)).deck, moved)).toBe(true);
  });
  it("two people changing different slides at once both keep their change", () => {
    const deck: Deck = { title: "T", slides: [buildSlide({ layout: "bullets", title: "One", body: "- a" }), buildSlide({ layout: "closing", title: "Two" })] };
    const bytes = initialDeckUpdate(deck);
    const a = loadDeck(bytes), b = loadDeck(bytes);
    const ua = writeDeck(a.ydoc, { ...deck, slides: [{ ...deck.slides[0]!, notes: "from A" }, deck.slides[1]!] }, "a");
    const ub = writeDeck(b.ydoc, { ...deck, slides: [deck.slides[0]!, { ...deck.slides[1]!, notes: "from B" }] }, "b");
    const merged = loadDeck(Y.mergeUpdates([bytes, ua, ub])).deck;
    expect(merged.slides.map((s) => s.notes)).toEqual(["from A", "from B"]);
  });
  it("reordering and deleting slides survive the round trip", () => {
    const deck: Deck = { title: "T", slides: ["A", "B", "C", "D"].map((t) => buildSlide({ layout: "bullets", title: t })) };
    const { ydoc } = loadDeck(initialDeckUpdate(deck));
    const next: Deck = { ...deck, slides: [deck.slides[2]!, deck.slides[0]!, deck.slides[3]!] };
    writeDeck(ydoc, next, "t");
    expect(loadDeck(Y.encodeStateAsUpdate(ydoc)).deck.slides.map(slideTitle)).toEqual(["C", "A", "D"]);
  });
});

describe("F04: a deck from a prompt", () => {
  it("asks first, then lays the deck out and writes every slide with speaker notes", async () => {
    const id = await newDeck();
    const { first, asked, ev } = await draft(id);
    expect(asked.content.kind).toBe("questions");
    expect(first.some((e) => e.type === "progress")).toBe(false); // nothing is written before the answers
    expect(first.at(-1)).toEqual({ type: "done", status: "awaiting_answers" });
    const deck = await deckOf(id);
    expect(deck.slides).toHaveLength(5);
    expect(deck.slides.every((s) => !s.pending && s.notes.length > 20)).toBe(true);
    expect(deck.slides[0]!.layout).toBe("title");
    expect(deck.slides.at(-1)!.layout).toBe("closing");
    const progress = ev.filter((e) => e.type === "progress" && e.done).map((e) => (e as { label: string }).label);
    expect(progress[0]).toBe("Outlined 5 slides");
    expect(progress.filter((p) => p.startsWith("Drafted slide"))).toHaveLength(5);
    const reply = (ev.filter((e) => e.type === "message").at(-1) as { message: Message }).message;
    expect(reply.undoable).toBe(true);
  });
  it("the library can find the deck by words on its slides, and names it after its title", async () => {
    const id = await newDeck();
    await draft(id);
    const { mirror } = await import("@/lib/rooms");
    await mirror(await roomOf(id));
    const found = await memoryData.listArtifacts(me.id, { q: "manual steps" });
    expect(found.map((a) => a.id)).toContain(id);
    expect(found.find((a) => a.id === id)!.title).toMatch(/weekly meeting/i);
  });
  it("one undo empties the deck again", async () => {
    const id = await newDeck();
    const { ev } = await draft(id);
    expect((await undoRun(runIdOf(ev), false, deps)).ok).toBe(true);
    expect((await deckOf(id)).slides).toHaveLength(0);
  });
  it("undo reports a slide a person edited since, and leaves the deck alone", async () => {
    const id = await newDeck();
    const { ev } = await draft(id);
    const room = await roomOf(id);
    const { ydoc, deck } = loadDeck(await localRooms.read(room));
    await localRooms.apply(room, writeDeck(ydoc, { ...deck, slides: deck.slides.map((s, i) => (i === 1 ? { ...s, notes: "my own notes" } : s)) }, "human"), "human");
    const res = await undoRun(runIdOf(ev), false, deps);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.conflicts.join(" ")).toMatch(/Slide 2/);
    expect((await deckOf(id)).slides).toHaveLength(5);
    expect((await undoRun(runIdOf(ev), true, deps)).ok).toBe(true);
    expect((await deckOf(id)).slides).toHaveLength(0);
  });
  it("stopping keeps the slides already written and removes the ones only planned", async () => {
    const id = await newDeck();
    const abort = new AbortController();
    let writes = 0;
    const model: Model = { ...fast, turn: async (req) => { const t = await fast.turn(req); if (t.blocks.some((b) => b.type === "tool_use" && b.name === "write_slide") && ++writes === 3) abort.abort(); return t; } };
    const d = { ...deps, model, signal: abort.signal };
    const { ev } = await draft(id, d);
    expect(ev.at(-1)).toEqual({ type: "done", status: "stopped" });
    const deck = await deckOf(id);
    expect(deck.slides).toHaveLength(2);
    expect(deck.slides.every((s) => !s.pending)).toBe(true);
  });
  it("a slide a person deletes during drafting is skipped, not recreated", async () => {
    const id = await newDeck();
    const room = await roomOf(id);
    let removed = "";
    const model: Model = { ...fast, turn: async (req) => {
      const t = await fast.turn(req);
      if (!removed && t.blocks.some((b) => b.type === "tool_use" && b.name === "write_slide")) { const { ydoc, deck } = loadDeck(await localRooms.read(room)); removed = deck.slides[3]!.id; await localRooms.apply(room, writeDeck(ydoc, { ...deck, slides: deck.slides.filter((s) => s.id !== removed) }, "human"), "human"); }
      return t;
    } };
    await draft(id, { ...deps, model });
    const deck = await deckOf(id);
    expect(deck.slides).toHaveLength(4);
    expect(deck.slides.some((s) => s.id === removed)).toBe(false);
  });
  it("changes an existing deck: adds a slide with notes, and writes missing notes", async () => {
    const board = (await memoryData.listArtifacts(me.id, { kind: "deck" })).find((a) => a.title === "Board update")!;
    const before = await deckOf(board.id);
    await drain(await startChatRun({ artifactId: board.id, message: "Add a slide about hiring" }, deps));
    const after = await deckOf(board.id);
    expect(after.slides).toHaveLength(before.slides.length + 1);
    expect(slideTitle(after.slides.at(-1)!)).toBe("Hiring");
    expect(after.slides.at(-1)!.notes).not.toBe("");
    expect(after.slides.slice(0, before.slides.length).every((s, i) => same(s, before.slides[i]))).toBe(true);
  });
});

describe("the AI acts with the asking person's permissions, on decks too", () => {
  it("a viewer is refused before anything runs, and nothing changes", async () => {
    const board = (await memoryData.listArtifacts(me.id, { kind: "deck" }))[0]!;
    const priya = await memoryData.signIn({ email: "priya@draftly.test", password: "draftly-demo" });
    grantForTest(board.id, priya.id, "viewer");
    const before = await deckOf(board.id);
    await expect(startChatRun({ artifactId: board.id, message: "Add a slide about hiring" }, { ...deps, user: priya })).rejects.toMatchObject({ code: "forbidden" });
    expect(same(await deckOf(board.id), before)).toBe(true);
  });
  it("someone with no access cannot even tell the deck exists", async () => {
    const board = (await memoryData.listArtifacts(me.id, { kind: "deck" }))[0]!;
    const priya = await memoryData.signIn({ email: "priya@draftly.test", password: "draftly-demo" });
    await expect(startChatRun({ artifactId: board.id, message: "x" }, { ...deps, user: priya })).rejects.toMatchObject({ code: "not_found" });
  });
  it("access removed in the middle of a run stops the writing", async () => {
    const id = await newDeck();
    const priya = await memoryData.signIn({ email: "priya@draftly.test", password: "draftly-demo" });
    grantForTest(id, priya.id, "editor");
    let writes = 0;
    const model: Model = { ...fast, turn: async (req) => { const t = await fast.turn(req); if (t.blocks.some((b) => b.type === "tool_use" && b.name === "write_slide") && ++writes === 2) grantForTest(id, priya.id, "viewer"); return t; } };
    await draft(id, { user: priya, data: memoryData, rooms: localRooms, model });
    const deck = await deckOf(id);
    expect(deck.slides.filter((s) => !s.pending && s.notes).length).toBe(1);
  });
  it("Edit with AI on a selection is a doc feature and says so", async () => {
    const board = (await memoryData.listArtifacts(me.id, { kind: "deck" }))[0]!;
    await expect(runSelectionEdit({ artifactId: board.id, scope: { startBlock: "a", endBlock: "a", startOffset: 0, endOffset: 1, text: "x" }, instruction: "shorter" }, deps)).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("F08: the design system", () => {
  it("the default passes its own contrast rules", () => { expect(checkContrast(DEFAULT_DESIGN.colors).every((c) => c.ok)).toBe(true); expect(contrast("#000000", "#ffffff")).toBe(21); });
  it("refuses a palette nobody could read, and says which pair", async () => {
    const bad = { ...DEFAULT_DESIGN, colors: { ...DEFAULT_DESIGN.colors, text: "#e8e4dc" } };
    const v = validateDesign(bad);
    expect(v.ok).toBe(false);
    expect(!v.ok && v.errors[0]).toMatch(/Text on background has a contrast of .*needs at least 4.5:1/);
    await expect(memoryData.saveDesign(me.id, bad)).rejects.toMatchObject({ code: "invalid" });
  });
  it("refuses colours and fonts that are not colours or listed fonts", () => {
    const v = validateDesign({ colors: { ...DEFAULT_DESIGN.colors, accent: "red" }, fonts: { heading: "comic", body: "inter" } });
    expect(!v.ok && v.errors).toEqual(["Accent needs a colour like #2a5f6a.", "Choose a heading font from the list."]);
  });
  it("a saved design system applies to every deck of that person, for everyone who can open them", async () => {
    const board = (await memoryData.listArtifacts(me.id, { kind: "deck" }))[0]!;
    const mine = { name: "Night", colors: { background: "#101418", surface: "#1b2229", text: "#f2f4f6", muted: "#b4bcc4", accent: "#f2b84b", onAccent: "#101418" }, fonts: { heading: "fraunces", body: "dm-sans" } };
    await memoryData.saveDesign(me.id, mine);
    const priya = await memoryData.signIn({ email: "priya@draftly.test", password: "draftly-demo" });
    grantForTest(board.id, priya.id, "viewer");
    expect((await memoryData.getDesign(priya.id, board.id)).colors.accent).toBe("#f2b84b");
    expect((await memoryData.getDesign(priya.id)).isDefault).toBe(true);
    expect((await memoryData.getDesign(me.id, (await newDeck()))).fonts.heading).toBe("fraunces");
    await memoryData.resetDesign(me.id);
    expect((await memoryData.getDesign(priya.id, board.id)).isDefault).toBe(true);
  });
  it("the design system of a deck you cannot open is not readable", async () => {
    const board = (await memoryData.listArtifacts(me.id, { kind: "deck" }))[0]!;
    const priya = await memoryData.signIn({ email: "priya@draftly.test", password: "draftly-demo" });
    await expect(memoryData.getDesign(priya.id, board.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
