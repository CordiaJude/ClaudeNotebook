import { describe, expect, it } from "vitest";
import { applyOps } from "@/lib/ops/engine";
import { blockHash } from "@/lib/ops/hash";
import { findById } from "@/lib/ops/targets";
import { blocks, ctx, find, fixture, fixtureJSON, fnd, hash, md, schema, text, tx, type Op } from "./ops-helpers";

const run = (ops: Op[], doc = fixture()) => applyOps(doc, ops, { schema, ctx });
const ok = (ops: Op[], doc = fixture()) => { const r = run(ops, doc); if (!r.ok) throw new Error(JSON.stringify(r)); return r; };
const err = (ops: Op[], doc = fixture()) => { const r = run(ops, doc); if (r.ok) throw new Error("expected failure"); return r; };

describe("replace · find", () => {
  it("rewords the quoted words in place, keeping marks and chips around them", () => {
    const r = ok([{ op: "replace", target: fnd("by March"), content: tx("by April") }]);
    expect(text(r.doc, "p1")).toBe("Ship the launch by April. Ship it well. Due ");
    expect(find(r.doc, "p1").lastChild!.type.name).toBe("dateChip");
    expect(JSON.stringify(find(r.doc, "p1").toJSON())).toContain('"bold"');
  });
  it("new text inherits the marks of the words it replaces", () => {
    const r = ok([{ op: "replace", target: fnd("Ship it "), content: tx("Ship fast ") }]);
    const bold = find(r.doc, "p1").toJSON().content.filter((n: { marks?: { type: string }[] }) => n.marks?.some((m) => m.type === "bold")).map((n: { text: string }) => n.text);
    expect(bold).toEqual(["Ship fast "]);
  });
  it("find_none when the words are not there; fix tells the agent to re-read", () => {
    const e = err([{ op: "replace", target: fnd("nonexistent phrase"), content: tx("x") }]);
    expect(e.code).toBe("find_none");
    expect(e.fix).toMatch(/re-read/i);
  });
  it("ambiguous find is bad_request; nth picks; nth too large is char_gone", () => {
    expect(err([{ op: "replace", target: fnd("launch"), content: tx("release") }]).code).toBe("bad_request");
    const r = ok([{ op: "replace", target: fnd("Closing words about the launch", 1), content: tx("Closing notes about the launch") }]);
    expect(text(r.doc, "p2")).toContain("Closing notes");
    expect(err([{ op: "replace", target: fnd("launch", 3), content: tx("x") }]).code).toBe("char_gone");
  });
  it("replacing with nothing is refused (use delete)", () => {
    expect(err([{ op: "replace", target: fnd("Goals"), content: tx("   ") }]).code).toBe("bad_request");
  });
  it("chip tokens in text become chips", () => {
    const r = ok([{ op: "replace", target: fnd("by March"), content: { as: "text", from: { kind: "inline", content: "by <?cn block d?>" }, blocks: { d: { type: "date", value: "2026-04-01" } } } }]);
    expect(find(r.doc, "p1").content.toString()).toContain("dateChip");
  });
  it("find within a cell only searches that cell", () => {
    const r = ok([{ op: "replace", target: { kind: "find", text: "Sam", within: { table: "tb1", row: 2, col: 1 } }, content: tx("Lee") }]);
    expect(find(r.doc, "tb1").textContent).toContain("Lee");
    expect(err([{ op: "replace", target: { kind: "find", text: "Sam", within: { table: "tb1", row: 1, col: 1 } }, content: tx("Lee") }]).code).toBe("find_none");
  });
});

describe("comment-anchor protection (F64)", () => {
  it("refuses to rewrite words under a comment: anchors_affected", () => {
    const e = err([{ op: "replace", target: fnd("Ship the launch by March"), content: tx("Ship the release by March") }]);
    expect(e.code).toBe("anchors_affected");
    expect(JSON.stringify(e.current)).toContain("th1");
  });
  it("narrowing the edit to avoid the anchored words succeeds and keeps the anchor", () => {
    const r = ok([{ op: "replace", target: fnd(" by March"), content: tx(" by May") }]);
    expect(JSON.stringify(find(r.doc, "p1").toJSON())).toContain("th1");
    expect(r.detached).toEqual([]);
  });
  it("allowDetach proceeds and reports the thread as detached", () => {
    const r = ok([{ op: "replace", target: fnd("launch by March"), content: tx("release by March"), allowDetach: true }]);
    expect(r.detached).toEqual(["th1"]);
    expect(JSON.stringify(find(r.doc, "p1").toJSON())).not.toContain("th1");
  });
  it("delete and whole-block replace/delete are protected too", () => {
    expect(err([{ op: "delete", target: fnd("launch by"), }]).code).toBe("anchors_affected");
    const d = fixture();
    expect(err([{ op: "delete", target: blocks("p1"), ifHash: hash(d, "p1") }], d).code).toBe("anchors_affected");
    expect(err([{ op: "replace", target: blocks("p1"), ifHash: hash(d, "p1"), content: tx("Fresh sentence.") }], d).code).toBe("anchors_affected");
  });
  it("markdown replace that would lose chips is refused as dropped", () => {
    const d = fixture();
    const e = err([{ op: "replace", target: blocks("p1"), ifHash: hash(d, "p1"), content: md("Plain text only"), allowDetach: true }], d);
    expect(e.code).toBe("dropped");
    expect(e.fix).toMatch(/chip/i);
  });
});

describe("replace · blocks and guards (human wins)", () => {
  it("whole-block replace needs ifHash: missing_guard names the current hash", () => {
    const d = fixture();
    const e = err([{ op: "replace", target: blocks("p2"), content: md("New closing.") }], d);
    expect(e.code).toBe("missing_guard");
    expect(e.fix).toContain(hash(d, "p2"));
  });
  it("guard_mismatch after a human edit; returns the current state; never forces", () => {
    const d = fixture();
    const stale = hash(d, "p2");
    const human = ok([{ op: "replace", target: fnd("Closing words"), content: tx("Final words") }], d).doc; // a person edits p2
    const e = err([{ op: "replace", target: blocks("p2"), ifHash: stale, content: md("Agent rewrite.") }], human);
    expect(e.code).toBe("guard_mismatch");
    expect(JSON.stringify(e.current)).toContain("Final words");
    expect(text(human, "p2")).toContain("Final words"); // untouched
    // agent re-reads and retries with the new hash: works
    const retry = ok([{ op: "replace", target: blocks("p2"), ifHash: hash(human, "p2"), content: md("Agent rewrite.") }], human);
    expect(text(retry.doc, "p2")).toBe("Agent rewrite.");
  });
  it("keeps the block id when one block is replaced by one of the same type", () => {
    const d = fixture();
    const r = ok([{ op: "replace", target: blocks("p2"), ifHash: hash(d, "p2"), content: md("Short.") }], d);
    expect(findById(r.doc, "p2")).not.toBeNull();
    expect(r.touched.some((x) => x.id === "p2")).toBe(true);
  });
  it("a pending block needs no guard and can become several blocks", () => {
    const r = ok([{ op: "replace", target: blocks("pe1"), content: md("## Risks\n\nVendor delay is the top risk: **2 weeks**.\n\n- Fallback: second vendor") }]);
    expect(findById(r.doc, "pe1")).toBeNull();
    expect(r.removed).toContain("pe1");
    expect(r.touched.length).toBeGreaterThanOrEqual(3);
  });
  it("block_gone when a person deleted the pending block: drop that section", () => {
    const d = fixture();
    const gone = ok([{ op: "delete", target: blocks("pe1") }], d).doc;
    const e = err([{ op: "replace", target: blocks("pe1"), content: md("Section text") }], gone);
    expect(e.code).toBe("block_gone");
    expect(e.fix).toMatch(/person removed|drop that section/i);
  });
  it("title and byline are structural: never replaced or deleted as blocks", () => {
    expect(err([{ op: "replace", target: blocks("t"), ifHash: "x", content: md("New") }]).code).toBe("bad_request");
    expect(err([{ op: "delete", target: blocks("by"), ifHash: "x" }]).code).toBe("bad_request");
    const r = ok([{ op: "replace", target: fnd("Launch plan"), content: tx("Q1 launch plan") }]);
    expect(text(r.doc, "t")).toBe("Q1 launch plan");
  });
  it("reword a whole text block with as:text keeps id, chips and hash guard", () => {
    const d = fixture();
    const r = ok([{ op: "replace", target: blocks("p2"), ifHash: hash(d, "p2"), content: tx("Closing words, tightened.") }], d);
    expect(text(r.doc, "p2")).toBe("Closing words, tightened.");
  });
  it("blocks must be contiguous siblings to be replaced as one", () => {
    const d = fixture();
    expect(err([{ op: "replace", target: blocks("h1", "p2"), ifHash: { h1: hash(d, "h1"), p2: hash(d, "p2") }, content: md("x") }], d).code).toBe("bad_request");
  });
});

describe("replace · cells (F20/F21)", () => {
  it("needs ifHash, then replaces the cell", () => {
    const d = fixture();
    const ref = { kind: "cell" as const, table: "tb1", row: 1, col: 1 };
    expect(err([{ op: "replace", target: ref, content: tx("Lee") }], d).code).toBe("missing_guard");
    const cellNode = d.child(7).child(1).child(1);
    const r = ok([{ op: "replace", target: ref, ifHash: blockHash(cellNode), content: tx("Lee") }], d);
    expect(find(r.doc, "tb1").textContent).toContain("Lee");
  });
  it("-1 means last; out of range is cell_none and returns the table", () => {
    const e = err([{ op: "replace", target: { kind: "cell", table: "tb1", row: 9, col: 0 }, ifHash: "x", content: tx("x") }]);
    expect(e.code).toBe("cell_none");
    expect(JSON.stringify(e.current)).toContain("Vendor");
    expect(err([{ op: "replace", target: { kind: "cell", table: "tb1", row: 1, col: 5 }, ifHash: "x", content: tx("x") }]).code).toBe("cell_none");
    const d = fixture();
    const last = d.child(7).child(2).child(1);
    ok([{ op: "replace", target: { kind: "cell", table: "tb1", row: -1, col: -1 }, ifHash: blockHash(last), content: tx("Z") }], d);
  });
  it("missing table is block_gone", () => {
    expect(err([{ op: "replace", target: { kind: "cell", table: "nope", row: 0, col: 0 }, ifHash: "x", content: tx("x") }]).code).toBe("block_gone");
  });
});

describe("insert", () => {
  it("after a block, from markdown, with new ids", () => {
    const r = ok([{ op: "insert", target: blocks("h1"), side: "after", content: md("Intro sentence.") }]);
    expect(r.doc.child(3).textContent).toBe("Intro sentence.");
    expect(r.doc.child(3).attrs.id).toBeTruthy();
  });
  it("nothing goes before the title/byline or between them", () => {
    expect(err([{ op: "insert", target: blocks("t"), side: "before", content: md("x") }]).code).toBe("bad_request");
    expect(err([{ op: "insert", target: blocks("t"), side: "after", content: md("x") }]).code).toBe("bad_request");
    expect(err([{ op: "insert", target: blocks("by"), side: "before", content: md("x") }]).code).toBe("bad_request");
    expect(ok([{ op: "insert", target: blocks("by"), side: "after", content: md("x") }]).doc.child(2).textContent).toBe("x");
  });
  it("root start goes right after the byline; root end appends", () => {
    expect(ok([{ op: "insert", target: { kind: "root" }, side: "start", content: md("First") }]).doc.child(2).textContent).toBe("First");
    const r = ok([{ op: "insert", target: { kind: "root" }, side: "end", content: md("Last") }]);
    expect(r.doc.lastChild!.textContent).toBe("Last");
    expect(err([{ op: "insert", target: { kind: "root" }, side: "before", content: md("x") }]).code).toBe("bad_request");
  });
  it("into a cell at start/end", () => {
    const r = ok([{ op: "insert", target: { kind: "cell", table: "tb1", row: 1, col: 0 }, side: "end", content: md("extra") }]);
    expect(find(r.doc, "tb1").child(1).child(0).textContent).toBe("Vendorextra");
  });
  it("inserts words next to quoted words", () => {
    const r = ok([{ op: "insert", target: fnd("by March"), side: "after", content: tx(" (firm)") }]);
    expect(text(r.doc, "p1")).toContain("by March (firm).");
  });
  it("adds a table row (needs the right number of cells) and a column to every row", () => {
    const r = ok([{ op: "insert", target: blocks("r1"), side: "after", content: { as: "row", cells: ["Legal", "Kim"] } }]);
    expect(find(r.doc, "tb1").childCount).toBe(4);
    expect(find(r.doc, "tb1").child(2).textContent).toBe("LegalKim");
    expect(err([{ op: "insert", target: blocks("r1"), side: "after", content: { as: "row", cells: ["only one"] } }]).code).toBe("bad_request");
    const c = ok([{ op: "insert", target: { kind: "cell", table: "tb1", row: 0, col: 1 }, side: "after", each: true, content: { as: "cells", values: ["Status", "On track", "At risk"] } }]);
    const tb = find(c.doc, "tb1");
    expect(tb.child(0).childCount).toBe(3);
    expect(tb.child(0).child(2).type.name).toBe("tableHeader");
    expect(tb.child(2).child(2).textContent).toBe("At risk");
    expect(err([{ op: "insert", target: { kind: "cell", table: "tb1", row: 0, col: 1 }, side: "after", content: { as: "cells", values: [] } }]).code).toBe("bad_request");
  });
});

describe("delete", () => {
  it("deletes quoted words; whole blocks need the hash", () => {
    const r = ok([{ op: "delete", target: fnd("Closing words about the ") }]);
    expect(text(r.doc, "p2")).toBe("launch plan.");
    const d = fixture();
    expect(err([{ op: "delete", target: blocks("p2") }], d).code).toBe("missing_guard");
    const g = ok([{ op: "delete", target: blocks("p2"), ifHash: hash(d, "p2") }], d);
    expect(g.removed).toContain("p2");
  });
  it("last_block: a tab always keeps a body block", () => {
    let d = fixture();
    for (const id of ["h1", "pe1", "ul1", "tk1", "tb1", "c1"]) d = ok([{ op: "delete", target: blocks(id), ifHash: id === "pe1" ? undefined : hash(d, id) }], d).doc;
    const e = err([{ op: "delete", target: blocks("p1", "p2"), ifHash: { p1: hash(d, "p1"), p2: hash(d, "p2") }, allowDetach: true }], d);
    expect(e.code).toBe("last_block");
  });
  it("deleting the only item of a list removes the list; a last table row/column is refused", () => {
    let d = ok([{ op: "delete", target: blocks("li1"), ifHash: hash(fixture(), "li1") }]).doc;
    d = ok([{ op: "delete", target: blocks("li2"), ifHash: hash(d, "li2") }], d).doc;
    expect(findById(d, "ul1")).toBeNull();
    const rows = ok([{ op: "delete", target: blocks("r1"), ifHash: hash(fixture(), "r1") }]);
    expect(find(rows.doc, "tb1").childCount).toBe(2);
  });
  it("deletes a column across all rows (each:true) but not the last", () => {
    const r = ok([{ op: "delete", target: { kind: "cell", table: "tb1", row: 0, col: 1 }, each: true }]);
    expect(find(r.doc, "tb1").child(1).childCount).toBe(1);
    expect(err([{ op: "delete", target: { kind: "cell", table: "tb1", row: 0, col: 1 } }]).code).toBe("bad_request");
    const one = ok([{ op: "delete", target: { kind: "cell", table: "tb1", row: 0, col: 1 }, each: true }]).doc;
    expect(err([{ op: "delete", target: { kind: "cell", table: "tb1", row: 0, col: 0 }, each: true }], one).code).toBe("last_block");
  });
});

describe("move · set · wrap · join", () => {
  it("moves blocks and keeps their ids", () => {
    const r = ok([{ op: "move", target: blocks("p2"), to: blocks("h1"), side: "after" }]);
    expect(r.doc.child(3).attrs.id).toBe("p2");
    expect(err([{ op: "move", target: blocks("p2"), to: blocks("t"), side: "before" }]).code).toBe("bad_request");
    expect(err([{ op: "move", target: blocks("tb1"), to: blocks("r1"), side: "after" }]).code).toBe("bad_request");
  });
  it("set: heading level, back to paragraph, list kind, task checked, cell background", () => {
    expect(ok([{ op: "set", target: blocks("h1"), attrs: { heading: 3 } }]).doc.child(2).attrs.level).toBe(3);
    expect(ok([{ op: "set", target: blocks("h1"), attrs: { heading: null } }]).doc.child(2).type.name).toBe("paragraph");
    const l = ok([{ op: "set", target: blocks("ul1"), attrs: { kind: "task" } }]);
    expect(find(l.doc, "ul1").type.name).toBe("taskList");
    expect(find(l.doc, "li1").type.name).toBe("taskItem");
    expect(find(ok([{ op: "set", target: blocks("ti1"), attrs: { checked: true } }]).doc, "ti1").attrs.checked).toBe(true);
    const bg = ok([{ op: "set", target: { kind: "cell", table: "tb1", row: 1, col: 1 }, attrs: { background: "green" } }]);
    expect(find(bg.doc, "tb1").child(1).child(1).attrs.background).toBe("green");
    expect(err([{ op: "set", target: { kind: "cell", table: "tb1", row: 1, col: 1 }, attrs: { background: "pink" } }]).code).toBe("bad_request");
    expect(err([{ op: "set", target: blocks("h1"), attrs: { nonsense: 1 } }]).code).toBe("bad_request");
    expect(err([{ op: "set", target: blocks("ul1"), attrs: { checked: true } }]).code).toBe("bad_request");
  });
  it("wrap in a quote or list, unwrap, join", () => {
    const w = ok([{ op: "wrap", target: blocks("p2"), with: "blockquote" }]);
    expect(w.doc.lastChild!.type.name).toBe("blockquote");
    const u = ok([{ op: "unwrap", target: { kind: "blocks", ids: [w.doc.lastChild!.attrs.id ?? ""] } }], w.doc);
    expect(u.ok).toBe(true);
    const l = ok([{ op: "wrap", target: blocks("p2"), with: "bulletList" }]);
    expect(l.doc.lastChild!.type.name).toBe("bulletList");
    const d = ok([{ op: "insert", target: blocks("p2"), side: "after", content: md("Tail.") }]).doc;
    const j = ok([{ op: "join", target: blocks("p2", d.lastChild!.attrs.id as string) }], d);
    expect(j.doc.lastChild!.textContent).toContain("plan.Tail.");
    expect(err([{ op: "join", target: blocks("h1", "p1") }]).code).toBe("bad_request");
  });
});

describe("call-level rules", () => {
  it("atomic: a failing later op changes nothing and reports its index", () => {
    const d = fixture();
    const before = JSON.stringify(d.toJSON());
    const e = err([{ op: "replace", target: fnd("by March"), content: tx("by June") }, { op: "replace", target: fnd("nope nope"), content: tx("x") }], d);
    expect(e.code).toBe("find_none");
    expect(e.opIndex).toBe(1);
    expect(JSON.stringify(d.toJSON())).toBe(before);
  });
  it("later ops see earlier ops' results", () => {
    const r = ok([{ op: "replace", target: fnd("by March"), content: tx("by June") }, { op: "replace", target: fnd("by June"), content: tx("by July") }]);
    expect(text(r.doc, "p1")).toContain("by July");
  });
  it("too_many, empty, restore", () => {
    const many = Array.from({ length: 51 }, () => ({ op: "set", target: blocks("h1"), attrs: { heading: 2 } }) as Op);
    expect(err(many).code).toBe("too_many");
    expect(err([]).code).toBe("bad_request");
    expect(err([{ op: "restore", revision: "r1" }]).code).toBe("bad_request");
  });
  it("reports touched blocks with their new hashes, and removed ids", () => {
    const r = ok([{ op: "replace", target: fnd(" by March"), content: tx(" by May") }, { op: "delete", target: blocks("pe1") }]);
    const t = r.touched.find((x) => x.id === "p1")!;
    expect(t.h).toBe(blockHash(find(r.doc, "p1")));
    expect(r.removed).toEqual(["pe1"]);
  });
  it("the title and byline always survive, and ids stay unique", () => {
    const r = ok([{ op: "insert", target: { kind: "root" }, side: "end", content: md("a\n\nb\n\n- x\n- y") }]);
    expect(r.doc.child(0).type.name).toBe("title");
    expect(r.doc.child(1).type.name).toBe("byline");
    const ids: string[] = [];
    r.doc.descendants((n) => { if (n.attrs.id) ids.push(n.attrs.id as string); });
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("fixture json stays valid", () => expect(() => schema.nodeFromJSON(fixtureJSON).check()).not.toThrow());
});

describe("malformed ops get a fix, not a stack trace", () => {
  const bad = (op: unknown) => err([op as Op]);
  it.each([
    [{}, /"op"/],
    [{ op: "nonsense" }, /"op"/],
    [{ op: "replace" }, /target/],
    [{ op: "replace", target: { kind: "weird" } }, /Unknown target kind/],
    [{ op: "replace", target: { kind: "find" } }, /"text"/],
    [{ op: "replace", target: { kind: "blocks", ids: "p1" } }, /ids/],
    [{ op: "replace", target: { kind: "cell", table: "tb1" } }, /row, col/],
    [{ op: "replace", target: { kind: "root" } }, /content/],
    [{ op: "insert", target: { kind: "root" }, content: { as: "markdown", from: { kind: "inline", content: "x" } } }, /side/],
    [{ op: "set", target: { kind: "blocks", ids: ["h1"] } }, /attrs/],
    [{ op: "move", target: { kind: "blocks", ids: ["h1"] } }, /"to"/],
    [{ op: "wrap", target: { kind: "blocks", ids: ["h1"] } }, /"with"/],
  ])("%j", (op, re) => {
    const e = bad(op);
    expect(e.code).toBe("bad_request");
    expect(e.fix).toMatch(re as RegExp);
  });
  it("content.from must be inline text", () => {
    expect(bad({ op: "replace", target: { kind: "find", text: "Goals" }, content: { as: "text", from: { kind: "file" } } }).code).toBe("bad_request");
  });
});
