import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { replaceText, undoAll, type Ok } from "@/lib/doc/edit";
import { describeSelection, onlyRangeChanged, replaceSelection, resolveScope } from "@/lib/doc/range";
import { rangeText, scopeOf } from "@/lib/doc/scope";
import { ids, makeDoc, posOf, texts } from "./doc-helpers";

const MD = "The launch moves to **4 March** because the supplier is late.\n\n## Timeline\n\nSecond paragraph, with more words in it.\n\n- first item\n- second item\n\n| Date | Owner |\n|---|---|\n| 4 March | Priya |\n\nLast paragraph.";
const doc = makeDoc("Plan", MD);
const sel = (needle: string) => { const from = posOf(doc, needle); return { from, to: from + needle.length }; };
const ok = (r: { ok: boolean }): Ok => { if (!r.ok) throw new Error(JSON.stringify(r)); return r as Ok; };

describe("Edit with AI: only the selection changes", () => {
  it("rewrites words inside a paragraph and nothing else", () => {
    const { from, to } = sel("because the supplier is late");
    const r = ok(replaceSelection(doc, from, to, "after a supplier delay"));
    expect(texts(r.doc)[1]).toBe("The launch moves to 4 March after a supplier delay.");
    expect(texts(r.doc).slice(2)).toEqual(texts(doc).slice(2));
    expect(onlyRangeChanged(doc, r.doc, from, to)).toBe(true);
  });
  it("keeps the formatting of the words it replaces", () => {
    const { from, to } = sel("4 March");
    const r = ok(replaceSelection(doc, from, to, "11 March"));
    expect(r.doc.child(1).child(1).marks.map((m) => m.type.name)).toEqual(["bold"]);
  });
  it("an inline selection cannot be replaced by headings or several paragraphs", () => {
    const { from, to } = sel("supplier");
    expect(replaceSelection(doc, from, to, "## Big\n\nand more")).toMatchObject({ ok: false, reason: "invalid" });
  });
  it("rewrites a selection that spans paragraphs, keeping the text before and after it", () => {
    const from = posOf(doc, "Second paragraph") + "Second ".length;
    const to = posOf(doc, "first item") + "first".length;
    const r = ok(replaceSelection(doc, from, to, "section, rewritten.\n\nA new paragraph.\n\n- new"));
    expect(onlyRangeChanged(doc, r.doc, from, to)).toBe(true);
    const all = texts(r.doc).join("|");
    expect(all).toContain("Second section, rewritten.");
    expect(all).toContain("Last paragraph.");
    expect(texts(r.doc)[1]).toBe(texts(doc)[1]);
  });
  it("works inside one table cell, and refuses a selection that crosses cells", () => {
    const { from, to } = sel("Priya");
    expect(ok(replaceSelection(doc, from, to, "Sam")).doc.textContent).toContain("Sam");
    const a = posOf(doc, "4 March | ".slice(0, 0) + "Date"), b = posOf(doc, "Owner") + 3;
    expect(describeSelection(doc, a, b)).toMatchObject({ ok: false, reason: "invalid" });
    expect(replaceSelection(doc, a, b, "x")).toMatchObject({ ok: false, reason: "invalid" });
  });
  it("shows the model the selection and its surroundings", () => {
    const { from, to } = sel("supplier is late");
    const d = describeSelection(doc, from, to);
    expect(d).toMatchObject({ ok: true, inline: true, markdown: "supplier is late" });
    expect(d.ok && d.before.endsWith("because the ")).toBe(true);
  });
  it("one undo puts the selection back", () => {
    const { from, to } = sel("because the supplier is late");
    const r = ok(replaceSelection(doc, from, to, "after a delay"));
    const back = undoAll(r.doc, [r.undo]);
    expect(back.ok && texts(back.doc)).toEqual(texts(doc));
  });

  it("property: whatever the selection and the replacement, text outside the selection never changes", () => {
    const size = doc.content.size;
    const replacement = fc.oneof(fc.constant(""), fc.string({ maxLength: 40 }), fc.constantFrom("plain words", "**bold** words", "## Heading\n\nBody", "- a\n- b", "one\n\ntwo", "| x | y |\n|---|---|\n| 1 | 2 |", "> quote", "1. step"));
    fc.assert(
      fc.property(fc.integer({ min: 0, max: size }), fc.integer({ min: 0, max: size }), replacement, (a, b, text) => {
        const from = Math.min(a, b), to = Math.max(a, b);
        if (from === to) return;
        let r;
        try { r = replaceSelection(doc, from, to, text); } catch { return; } // positions that are not text positions
        if (!r.ok) return; // a refusal changes nothing
        r.doc.check();
        expect(onlyRangeChanged(doc, r.doc, from, to)).toBe(true);
        const before = rangeText(doc, 0, from), after = rangeText(doc, to, size);
        const out = rangeText(r.doc, 0, r.doc.content.size);
        expect(out.startsWith(before)).toBe(true);
        expect(out.endsWith(after)).toBe(true);
        expect(new Set(ids(r.doc)).size).toBe(r.doc.childCount);
      }),
      { numRuns: 3000 },
    );
  });
});

describe("finding the selection again", () => {
  const { from, to } = sel("supplier is late");
  const scope = scopeOf(doc, from, to)!;

  it("resolves on an unchanged document", () => {
    expect(resolveScope(doc, scope)).toEqual({ ok: true, from, to });
  });
  it("still finds it after a person types earlier in the same paragraph", () => {
    const edited = ok(replaceText(doc, ids(doc)[1]!, "The launch", "The whole product launch")).doc;
    const r = resolveScope(edited, scope);
    expect(r.ok && rangeText(edited, r.from, r.to)).toBe("supplier is late");
  });
  it("still finds it after edits in other blocks", () => {
    const edited = ok(replaceText(doc, ids(doc)[3]!, "Second", "A much longer second")).doc;
    expect(resolveScope(edited, scope)).toEqual({ ok: true, from, to });
  });
  it("refuses when the selected words themselves changed, or the block is gone", () => {
    const edited = ok(replaceText(doc, ids(doc)[1]!, "supplier is late", "vendor slipped")).doc;
    expect(resolveScope(edited, scope)).toMatchObject({ ok: false, reason: "changed" });
    expect(resolveScope(makeDoc("Other", "Nothing here."), scope)).toMatchObject({ ok: false, reason: "gone" });
  });
  it("the title and empty selections cannot be pinned", () => {
    expect(scopeOf(doc, 1, 3)).toBeNull();
    expect(scopeOf(doc, from, from)).toBeNull();
  });
});
