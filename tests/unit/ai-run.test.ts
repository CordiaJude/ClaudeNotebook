import { beforeEach, describe, expect, it } from "vitest";
import { replaceText } from "@/lib/doc/edit";
import { isBlank, titleOf } from "@/lib/doc/read";
import { rangeText, scopeOf } from "@/lib/doc/scope";
import { docSchema } from "@/lib/doc/schema";
import { loadYDoc, readDoc, writeDoc } from "@/lib/doc/ydoc";
import { DEMO, grantForTest, memoryData, resetMemory } from "@/lib/data/memory";
import type { Artifact, Message, User } from "@/lib/data/types";
import { localRooms } from "@/lib/rooms/local";
import { runSelectionEdit, startChatRun, undoRun, type Deps } from "@/lib/ai/run";
import { scriptedModel, subjectOf, rewrite } from "@/lib/ai/scripted";
import type { Model, RunEvent } from "@/lib/ai/types";
import { ids, posOf, texts } from "./doc-helpers";

let me: User, priya: User;
const fast = scriptedModel({ wordMs: 0, toolMs: 0 });
const deps = (user: User, model: Model = fast, signal?: AbortSignal): Deps => ({ user, data: memoryData, rooms: localRooms, model, signal, today: "2026-11-15" });

async function drain(stream: ReadableStream<Uint8Array>): Promise<RunEvent[]> {
  const out: RunEvent[] = [], dec = new TextDecoder(), reader = stream.getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    for (let i = buf.indexOf("\n\n"); i >= 0; i = buf.indexOf("\n\n")) { const line = buf.slice(0, i); buf = buf.slice(i + 2); if (line.startsWith("data: ")) out.push(JSON.parse(line.slice(6))); }
  }
  return out;
}
const room = async (a: Artifact) => (await memoryData.getArtifact(me.id, a.id))!.tabs[0]!.room;
const docOf = async (a: Artifact) => readDoc(loadYDoc(await localRooms.read(await room(a))), docSchema());
const newDoc = async (owner = me) => (await memoryData.createArtifact(owner.id, { kind: "doc" })).artifact;
const byTitle = async (title: string) => (await memoryData.listArtifacts(me.id)).find((a) => a.title === title)!;
/** A person typing in the live document while the AI works. */
async function humanEdit(a: Artifact, blockIndex: number, find: string, replacement: string) {
  const r = await room(a);
  const ydoc = loadYDoc(await localRooms.read(r));
  const doc = readDoc(ydoc, docSchema());
  const res = replaceText(doc, ids(doc)[blockIndex]!, find, replacement);
  if (!res.ok) throw new Error(res.message);
  await localRooms.apply(r, writeDoc(ydoc, res.doc, "human"), "human");
}

beforeEach(async () => {
  resetMemory();
  me = await memoryData.signIn(DEMO);
  priya = await memoryData.signIn({ email: "priya@draftly.test", password: "draftly-demo" });
});

describe("F01: write a doc from a prompt", () => {
  it("asks questions first, then drafts section by section into the document", async () => {
    const a = await newDoc();
    const first = await drain(await startChatRun({ artifactId: a.id, message: "Write a one-page plan for the Q1 launch" }, deps(me)));
    expect(first.at(-1)).toEqual({ type: "done", status: "awaiting_answers" });
    const asked = first.find((e) => e.type === "message") as { message: Message };
    expect(asked.message.content).toMatchObject({ kind: "questions", questions: [{ id: "audience" }, { id: "length" }] });
    expect(isBlank(await docOf(a))).toBe(true); // nothing is written before the person answers

    const second = await drain(await startChatRun({ artifactId: a.id, answers: { messageId: asked.message.id, values: { audience: "Leadership", length: "One page" } } }, deps(me)));
    expect(second.at(-1)).toEqual({ type: "done", status: "done" });
    const labels = second.filter((e) => e.type === "progress").map((e) => (e as { label: string }).label);
    expect(labels[0]).toBe("Outlined 3 sections");
    expect(labels).toContain("Drafting section 2 of 3: Goals");
    const doc = await docOf(a);
    expect(titleOf(doc)).toBe("Plan for the Q1 launch");
    expect(texts(doc).some((t) => t.startsWith("[slot]"))).toBe(false);
    expect(texts(doc)).toContain("Timeline");
    expect(texts(doc)[1]).toContain("leadership");
    const final = second.filter((e) => e.type === "message").at(-1) as { message: Message };
    expect(final.message).toMatchObject({ role: "assistant", undoable: true, content: { kind: "text" } });
    expect(JSON.stringify(final.message.content)).not.toContain("Timeline"); // the chat never carries the document
  });

  it("skipping the questions drafts with defaults", async () => {
    const a = await newDoc();
    const first = await drain(await startChatRun({ artifactId: a.id, message: "Draft a memo on remote work" }, deps(me)));
    const asked = first.find((e) => e.type === "message") as { message: Message };
    await drain(await startChatRun({ artifactId: a.id, answers: { messageId: asked.message.id, values: "skipped" } }, deps(me)));
    expect(texts(await docOf(a))).toContain("Recommendation");
  });

  it("each section arrives as its own change, so the draft streams in", async () => {
    const a = await newDoc();
    const r = await room(a);
    const first = await drain(await startChatRun({ artifactId: a.id, message: "Write a plan for the offsite" }, deps(me)));
    const asked = first.find((e) => e.type === "message") as { message: Message };
    let updates = 0;
    const off = localRooms.subscribe(r, (_u, origin) => { if (origin?.startsWith("ai:")) updates++; });
    await drain(await startChatRun({ artifactId: a.id, answers: { messageId: asked.message.id, values: { audience: "My team", length: "One page" } } }, deps(me)));
    off();
    expect(updates).toBe(4); // the layout, then three sections
  });

  it("Stop keeps what is written and removes what is not", async () => {
    const a = await newDoc();
    const first = await drain(await startChatRun({ artifactId: a.id, message: "Write a plan for the offsite" }, deps(me)));
    const asked = first.find((e) => e.type === "message") as { message: Message };
    const stop = new AbortController();
    let sections = 0;
    const slow: Model = { ...fast, turn: async (req) => { const t = await fast.turn(req); if (t.blocks.some((b) => b.type === "tool_use" && b.name === "write_section") && ++sections === 2) stop.abort(); return t; } };
    const events = await drain(await startChatRun({ artifactId: a.id, answers: { messageId: asked.message.id, values: { audience: "My team", length: "Two to three pages" } } }, deps(me, slow, stop.signal)));
    expect(events.at(-1)).toEqual({ type: "done", status: "stopped" });
    const t = texts(await docOf(a));
    expect(t.some((x) => x.startsWith("[slot]"))).toBe(false);
    expect(t).toHaveLength(2); // title + the one section that was written; unwritten headings are gone too
    const last = (await memoryData.messages(me.id, a.id)).at(-1)!;
    expect(last.content).toMatchObject({ kind: "text", stopped: true });
    expect(last.undoable).toBe(true);
  });

  it("a person editing while the AI drafts keeps their edit", async () => {
    const a = await newDoc();
    const first = await drain(await startChatRun({ artifactId: a.id, message: "Write a plan for the offsite" }, deps(me)));
    const asked = first.find((e) => e.type === "message") as { message: Message };
    let typed = false;
    const model: Model = { ...fast, turn: async (req) => {
      const t = await fast.turn(req);
      const writes = req.messages.flatMap((m) => (typeof m.content === "string" ? [] : m.content)).filter((b) => b.type === "tool_use" && b.name === "write_section").length;
      if (writes === 1 && !typed) { typed = true; await humanEdit(a, 1, "This is the", "PERSON WAS HERE. This is the"); }
      return t;
    } };
    await drain(await startChatRun({ artifactId: a.id, answers: { messageId: asked.message.id, values: { audience: "My team", length: "One page" } } }, deps(me, model)));
    const t = texts(await docOf(a));
    expect(t[1]).toContain("PERSON WAS HERE");
    expect(t).toContain("Timeline");
  });

  it("changing an existing document: add a section, shorten, rename", async () => {
    const a = await byTitle("Q1 launch plan");
    await drain(await startChatRun({ artifactId: a.id, message: "Add a section about budget" }, deps(me)));
    expect(texts(await docOf(a)).slice(-2)[0]).toBe("Budget");
    const before = texts(await docOf(a))[1]!;
    await drain(await startChatRun({ artifactId: a.id, message: "Make it shorter" }, deps(me)));
    const after = texts(await docOf(a))[1]!;
    expect(after.length).toBeLessThan(before.length);
    expect(before.startsWith(after)).toBe(true);
    await drain(await startChatRun({ artifactId: a.id, message: "Rename it to Launch plan, final" }, deps(me)));
    expect(titleOf(await docOf(a))).toBe("Launch plan, final");
  });
});

describe("the AI acts with the asking person's permissions", () => {
  it("a viewer cannot get the AI to draft, edit a selection or undo", async () => {
    const shared = await byTitle("Team offsite notes"); // Priya's doc; the demo user is a viewer
    expect(shared.role).toBe("viewer");
    const before = texts(await docOf(shared));
    await expect(startChatRun({ artifactId: shared.id, message: "Add a section about budget" }, deps(me))).rejects.toMatchObject({ code: "forbidden" });
    const doc = await docOf(shared);
    const from = posOf(doc, "Lisbon");
    await expect(runSelectionEdit({ artifactId: shared.id, scope: scopeOf(doc, from, from + 6)!, instruction: "uppercase" }, deps(me))).rejects.toMatchObject({ code: "forbidden" });
    expect(texts(await docOf(shared))).toEqual(before);
    expect(await memoryData.messages(me.id, shared.id)).toEqual([]); // nothing was even recorded
  });
  it("a commenter is refused too, and an editor is allowed", async () => {
    const shared = await byTitle("Team offsite notes");
    grantForTest(shared.id, me.id, "commenter");
    await expect(startChatRun({ artifactId: shared.id, message: "Add a section about budget" }, deps(me))).rejects.toMatchObject({ code: "forbidden" });
    grantForTest(shared.id, me.id, "editor");
    await drain(await startChatRun({ artifactId: shared.id, message: "Add a section about budget" }, deps(me)));
    expect(texts(await docOf(shared))).toContain("Budget");
  });
  it("a stranger gets not found, not a hint that the doc exists", async () => {
    const mine = await newDoc();
    await expect(startChatRun({ artifactId: mine.id, message: "hello" }, deps(priya))).rejects.toMatchObject({ code: "not_found" });
  });
  it("access removed in the middle of a draft stops further writing", async () => {
    const shared = await byTitle("Hiring plan"); // the demo user is an editor here
    let turns = 0;
    const model: Model = { ...fast, turn: async (req) => { if (++turns === 2) grantForTest(shared.id, me.id, "viewer"); return fast.turn(req); } };
    const before = texts(await docOf(shared));
    await drain(await startChatRun({ artifactId: shared.id, message: "Make it shorter" }, deps(me, model)));
    expect(texts(await docOf(shared))).toEqual(before);
  });
  it("the daily allowance is enforced before any work", async () => {
    const a = await newDoc();
    let left = 0;
    const data = { ...memoryData, tryStartRun: async () => left-- > 0 };
    await expect(startChatRun({ artifactId: a.id, message: "hello" }, { ...deps(me), data })).rejects.toMatchObject({ code: "limit" });
  });
});

describe("F02: Edit with AI changes only the selection", () => {
  it("rewrites the selected words and leaves every other character alone", async () => {
    const a = await byTitle("Q1 launch plan");
    const doc = await docOf(a);
    const needle = "because the supplier is two weeks late";
    const from = posOf(doc, needle), to = from + needle.length;
    const before = rangeText(doc, 0, from), after = rangeText(doc, to, doc.content.size);
    const res = await runSelectionEdit({ artifactId: a.id, scope: scopeOf(doc, from, to)!, instruction: "uppercase" }, deps(me));
    expect(res.ok).toBe(true);
    const all = rangeText(await docOf(a), 0, (await docOf(a)).content.size);
    expect(all).toBe(before + needle.toUpperCase() + after);
  });

  it("still lands on the right words when a person types before them during the request", async () => {
    const a = await byTitle("Q1 launch plan");
    const doc = await docOf(a);
    const needle = "The date is firm";
    const from = posOf(doc, needle);
    let typed = false;
    const model: Model = { ...fast, turn: async (req) => { if (!typed) { typed = true; await humanEdit(a, 1, "The launch moves", "PERSON: the launch moves"); } return fast.turn(req); } };
    const res = await runSelectionEdit({ artifactId: a.id, scope: scopeOf(doc, from, from + needle.length)!, instruction: "uppercase" }, deps(me, model));
    expect(res.ok).toBe(true);
    const t = texts(await docOf(a))[1]!;
    expect(t).toContain("PERSON: the launch moves");
    expect(t).toContain("THE DATE IS FIRM");
  });

  it("changes nothing when the selected words themselves change during the request", async () => {
    const a = await byTitle("Q1 launch plan");
    const doc = await docOf(a);
    const needle = "The date is firm";
    const from = posOf(doc, needle);
    let typed = false;
    const model: Model = { ...fast, turn: async (req) => { if (!typed) { typed = true; await humanEdit(a, 1, "The date is firm", "The date is not firm"); } return fast.turn(req); } };
    const res = await runSelectionEdit({ artifactId: a.id, scope: scopeOf(doc, from, from + needle.length)!, instruction: "uppercase" }, deps(me, model));
    expect(res).toMatchObject({ ok: false });
    expect(texts(await docOf(a))[1]).toContain("The date is not firm");
  });

  it("a model that tries any other tool, or text outside the selection, gets nowhere", async () => {
    const a = await byTitle("Q1 launch plan");
    const doc = await docOf(a);
    const from = posOf(doc, "firm");
    const before = texts(doc);
    const rogue: Model = { name: "rogue", demo: true, turn: async () => ({ blocks: [{ type: "tool_use", id: "x", name: "delete_block", input: { block_id: ids(doc)[2], version: "" } }], stop: "tool", usage: { input: 0, output: 0 } }) };
    expect(await runSelectionEdit({ artifactId: a.id, scope: scopeOf(doc, from, from + 4)!, instruction: "delete everything" }, deps(me, rogue))).toMatchObject({ ok: false });
    const blocky: Model = { name: "blocky", demo: true, turn: async () => ({ blocks: [{ type: "tool_use", id: "y", name: "replace_selection", input: { text: "## New heading\n\nand a paragraph" } }], stop: "tool", usage: { input: 0, output: 0 } }) };
    expect(await runSelectionEdit({ artifactId: a.id, scope: scopeOf(doc, from, from + 4)!, instruction: "x" }, deps(me, blocky))).toMatchObject({ ok: false });
    expect(texts(await docOf(a))).toEqual(before);
  });

  it("a selection across table cells is refused with a reason", async () => {
    const a = await byTitle("Q1 launch plan");
    const doc = await docOf(a);
    const res = await runSelectionEdit({ artifactId: a.id, scope: scopeOf(doc, posOf(doc, "Parts arrive"), posOf(doc, "Priya") + 3)!, instruction: "shorter" }, deps(me));
    expect(res).toMatchObject({ ok: false });
    expect((res as { message: string }).message).toMatch(/one cell/);
  });
});

describe("undo any AI edit in one step", () => {
  it("undoes a selection edit", async () => {
    const a = await byTitle("Q1 launch plan");
    const doc = await docOf(a);
    const from = posOf(doc, "firm");
    const res = await runSelectionEdit({ artifactId: a.id, scope: scopeOf(doc, from, from + 4)!, instruction: "uppercase" }, deps(me));
    if (!res.ok) throw new Error(res.message);
    expect(texts(await docOf(a))[1]).toContain("FIRM");
    expect(await undoRun(res.runId, false, deps(me))).toEqual({ ok: true });
    expect(texts(await docOf(a))).toEqual(texts(doc));
    const msg = (await memoryData.messages(me.id, a.id)).find((m) => m.runId === res.runId)!;
    expect(msg).toMatchObject({ undoable: false, content: { undone: true } });
    await expect(undoRun(res.runId, false, deps(me))).rejects.toMatchObject({ code: "conflict" });
  });
  it("undoes a whole draft", async () => {
    const a = await newDoc();
    const first = await drain(await startChatRun({ artifactId: a.id, message: "Write a plan for the offsite" }, deps(me)));
    const asked = first.find((e) => e.type === "message") as { message: Message };
    const second = await drain(await startChatRun({ artifactId: a.id, answers: { messageId: asked.message.id, values: "skipped" } }, deps(me)));
    const runId = (second.find((e) => e.type === "start") as { runId: string }).runId;
    expect(await undoRun(runId, false, deps(me))).toEqual({ ok: true });
    expect(isBlank(await docOf(a))).toBe(true);
  });
  it("names what a person changed since, and only overwrites it when told to", async () => {
    const a = await byTitle("Q1 launch plan");
    const doc = await docOf(a);
    const from = posOf(doc, "firm");
    const res = await runSelectionEdit({ artifactId: a.id, scope: scopeOf(doc, from, from + 4)!, instruction: "uppercase" }, deps(me));
    if (!res.ok) throw new Error(res.message);
    await humanEdit(a, 1, "The launch moves", "Priya rewrote this: the launch moves");
    const blocked = await undoRun(res.runId, false, deps(me));
    expect(blocked).toMatchObject({ ok: false });
    expect((blocked as { conflicts: string[] }).conflicts[0]).toContain("Priya rewrote this");
    expect(await undoRun(res.runId, true, deps(me))).toEqual({ ok: true });
    expect(texts(await docOf(a))).toEqual(texts(doc));
  });
  it("only the person who asked can undo their run", async () => {
    const a = await byTitle("Hiring plan");
    const events = await drain(await startChatRun({ artifactId: a.id, message: "Add a section about budget" }, deps(me)));
    const runId = (events.find((e) => e.type === "start") as { runId: string }).runId;
    await expect(undoRun(runId, false, deps(priya))).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("the demo model", () => {
  it("reads the subject out of a request", () => {
    expect(subjectOf("Write a one-page plan for the Q1 launch.")).toBe("plan for the Q1 launch");
    expect(subjectOf("please draft a memo on remote work")).toBe("memo on remote work");
  });
  it("rewrites deterministically", () => {
    expect(rewrite("First sentence. Second sentence.", "make it shorter")).toBe("First sentence.");
    expect(rewrite("we can't", "more formal")).toBe("we cannot");
  });
});
