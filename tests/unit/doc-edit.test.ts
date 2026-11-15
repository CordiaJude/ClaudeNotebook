import { describe, expect, it } from "vitest";
import { deleteBlock, dropUnwritten, fillSlot, insertBlocks, layOut, replaceBlock, replaceText, setTitle, undoAll, type Ok, type UndoEntry } from "@/lib/doc/edit";
import { versionOf } from "@/lib/doc/ids";
import { parseInline, parseMarkdown, toMarkdown } from "@/lib/doc/markdown";
import { blockMarkdown, findBlock, isBlank, outline, searchBlocks, titleOf } from "@/lib/doc/read";
import { ids, makeDoc, texts } from "./doc-helpers";

const ok = (r: { ok: boolean }): Ok => { if (!r.ok) throw new Error(JSON.stringify(r)); return r as Ok; };

describe("markdown", () => {
  it("parses headings, lists, tables and marks into blocks with unique ids", () => {
    const blocks = parseMarkdown("## Risks\n\nTwo **bold** risks.\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |");
    expect(blocks.map((b) => b.type.name)).toEqual(["heading", "paragraph", "bulletList", "table"]);
    expect(new Set(blocks.map((b) => b.attrs.id)).size).toBe(4);
  });
  it("round-trips the common shapes back to markdown", () => {
    const md = "## Risks\n\nTwo **bold** risks with a [link](https://example.com).\n\n- one\n- two\n\n1. first\n2. second";
    expect(toMarkdown(parseMarkdown(md))).toBe(md);
  });
  it("inline: one paragraph is inline content, more is not", () => {
    expect(parseInline("just **one** line")?.childCount).toBe(3);
    expect(parseInline("one\n\ntwo")).toBeNull();
    expect(parseInline("## heading")).toBeNull();
  });
  it("never produces a title or a placeholder from model text", () => {
    expect(parseMarkdown("(not written yet: x)").map((b) => b.type.name)).toEqual(["paragraph"]);
  });
});

describe("drafting a new document", () => {
  const blank = makeDoc("");
  const plan = { title: "Q1 launch plan", sections: [{ intent: "The decision in one paragraph" }, { heading: "Timeline", intent: "Dates and owners, as a table" }, { heading: "Risks", intent: "What could slip" }] };

  it("lays out a title, headings and one placeholder per section", () => {
    const r = ok(layOut(blank, plan));
    expect(titleOf(r.doc)).toBe("Q1 launch plan");
    expect(texts(r.doc)).toEqual(["Q1 launch plan", "[slot] The decision in one paragraph", "Timeline", "[slot] Dates and owners, as a table", "Risks", "[slot] What could slip"]);
  });
  it("keeps a title the person already typed", () => {
    expect(titleOf(ok(layOut(makeDoc("My own title"), plan)).doc)).toBe("My own title");
  });
  it("refuses to lay out a document that already has content", () => {
    expect(layOut(makeDoc("T", "Existing text."), plan)).toMatchObject({ ok: false, reason: "not_blank" });
  });
  it("fills one section at a time and leaves the others waiting", () => {
    const laid = ok(layOut(blank, plan));
    const slot = ids(laid.doc)[3]!;
    const r = ok(fillSlot(laid.doc, slot, "| Date | Owner |\n|---|---|\n| 4 March | Priya |"));
    expect(r.doc.child(3).type.name).toBe("table");
    expect(texts(r.doc).filter((t) => t.startsWith("[slot]"))).toHaveLength(2);
  });
  it("a placeholder a person deleted is not written and not recreated", () => {
    const laid = ok(layOut(blank, plan));
    const slot = ids(laid.doc)[5]!;
    const without = ok(deleteBlock(laid.doc, slot)).doc;
    expect(fillSlot(without, slot, "Text")).toMatchObject({ ok: false, reason: "gone" });
  });
  it("stopping removes unwritten placeholders and their headings, and keeps what was written", () => {
    const laid = ok(layOut(blank, plan));
    const filled = ok(fillSlot(laid.doc, ids(laid.doc)[1]!, "We launch on 4 March.")).doc;
    expect(texts(dropUnwritten(filled))).toEqual(["Q1 launch plan", "We launch on 4 March."]);
  });
});

describe("changing an existing document", () => {
  const doc = makeDoc("Plan", "First paragraph about the launch.\n\n## Timeline\n\nWe ship in **March** and again in March.\n\n- one\n- two");
  const [, p1, , p2, list] = ids(doc) as [string, string, string, string, string];

  it("replace_block swaps one block and keeps the rest byte for byte", () => {
    const r = ok(replaceBlock(doc, p1, "A shorter opening.", versionOf(findBlock(doc, p1)!.node)));
    expect(texts(r.doc)).toEqual(["Plan", "A shorter opening.", "Timeline", "We ship in March and again in March.", "onetwo"]);
    expect(r.doc.child(3).eq(doc.child(3))).toBe(true);
  });
  it("a stale version is refused and shows the block as it now stands", () => {
    const edited = ok(replaceText(doc, p1, "launch", "release")).doc;
    const r = replaceBlock(edited, p1, "AI rewrite", versionOf(findBlock(doc, p1)!.node));
    expect(r).toMatchObject({ ok: false, reason: "changed" });
    expect((r as { current: string }).current).toContain("release");
  });
  it("replace_text changes the words and keeps their formatting", () => {
    const r = ok(replaceText(doc, p2, "March", "April", 1));
    expect(blockMarkdown(r.doc, p2)).toBe("We ship in **April** and again in March.");
  });
  it("replace_text refuses to guess between two occurrences", () => {
    expect(replaceText(doc, p2, "March", "April")).toMatchObject({ ok: false, reason: "ambiguous" });
    expect(replaceText(doc, p2, "June", "July")).toMatchObject({ ok: false, reason: "not_found" });
  });
  it("replace_text reaches inside list items", () => {
    expect(texts(ok(replaceText(doc, list, "two", "three")).doc).at(-1)).toBe("onethree");
  });
  it("insert after a block, at the start and at the end", () => {
    expect(texts(ok(insertBlocks(doc, { after: p1 }, "Inserted.")).doc)[2]).toBe("Inserted.");
    expect(texts(ok(insertBlocks(doc, { at: "start" }, "Lead.")).doc)[1]).toBe("Lead.");
    expect(texts(ok(insertBlocks(doc, { at: "end" }, "Tail.")).doc).at(-1)).toBe("Tail.");
  });
  it("the title cannot be deleted or replaced as a block", () => {
    const t = ids(doc)[0]!;
    expect(deleteBlock(doc, t)).toMatchObject({ ok: false, reason: "invalid" });
    expect(replaceBlock(doc, t, "x")).toMatchObject({ ok: false, reason: "invalid" });
    expect(titleOf(ok(setTitle(doc, "New name")).doc)).toBe("New name");
  });
  it("deleting every block leaves one empty paragraph, never an invalid document", () => {
    let cur = doc;
    for (const id of ids(doc).slice(1)) cur = ok(deleteBlock(cur, id)).doc;
    expect(isBlank(cur)).toBe(true);
  });
  it("outline and search name blocks by id and version", () => {
    expect(outline(doc).split("\n")[1]).toMatch(new RegExp(`^\\[${p1} v[0-9a-f]{8}\\] paragraph: First paragraph`));
    expect(searchBlocks(doc, "ship")).toContain(p2);
  });
});

describe("undo of a whole run", () => {
  it("puts back a drafted document in one step", () => {
    const blank = makeDoc("");
    const entries: UndoEntry[] = [];
    let cur = blank;
    const step = (r: { ok: boolean }) => { const o = ok(r); entries.push(o.undo); cur = o.doc; };
    step(layOut(cur, { title: "Plan", sections: [{ intent: "Lead" }, { heading: "Risks", intent: "Risks" }] }));
    step(fillSlot(cur, ids(cur)[1]!, "We launch in March."));
    step(fillSlot(cur, ids(cur)[3]!, "- Supplier delay\n- Budget"));
    const back = undoAll(cur, entries);
    expect(back.ok && isBlank(back.doc) && titleOf(back.doc)).toBe("");
  });
  it("puts back an edit and leaves a person's later edit elsewhere alone", () => {
    const doc = makeDoc("T", "One.\n\nTwo.\n\nThree.");
    const [, a, , c] = ids(doc) as [string, string, string, string];
    const ai = ok(replaceBlock(doc, a, "ONE, rewritten."));
    const human = ok(replaceText(ai.doc, c, "Three", "Three, by a person")).doc;
    const back = undoAll(human, [ai.undo]);
    expect(back.ok && texts(back.doc)).toEqual(["T", "One.", "Two.", "Three, by a person."]);
  });
  it("reports a conflict instead of erasing a person's edit to the same block, unless forced", () => {
    const doc = makeDoc("T", "One.\n\nTwo.");
    const ai = ok(replaceBlock(doc, ids(doc)[1]!, "ONE, rewritten."));
    const human = ok(replaceText(ai.doc, ai.changed[0]!.id, "rewritten", "rewritten and then fixed by Priya")).doc;
    const back = undoAll(human, [ai.undo]);
    expect(back).toMatchObject({ ok: false });
    expect((back as { conflicts: string[] }).conflicts[0]).toContain("Priya");
    const forced = undoAll(human, [ai.undo], { force: true });
    expect(forced.ok && texts(forced.doc)).toEqual(["T", "One.", "Two."]);
  });
  it("puts back a deletion where it was", () => {
    const doc = makeDoc("T", "One.\n\nTwo.\n\nThree.");
    const del = ok(deleteBlock(doc, ids(doc)[2]!));
    const back = undoAll(del.doc, [del.undo]);
    expect(back.ok && texts(back.doc)).toEqual(["T", "One.", "Two.", "Three."]);
  });
});
