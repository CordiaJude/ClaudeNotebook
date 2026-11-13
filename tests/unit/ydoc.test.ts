import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { applyOps } from "@/lib/ops/engine";
import { blockHash } from "@/lib/ops/hash";
import { birthUpdate, loadYDoc, readPM, writePM } from "@/lib/ops/ydoc";
import { blocks, ctx, find, fixture, fnd, md, schema, text, tx, type Op } from "./ops-helpers";

const edit = (ydoc: Y.Doc, ops: Op[], origin = "agent:test") => {
  const r = applyOps(readPM(ydoc, schema), ops, { schema, ctx });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return writePM(ydoc, r.doc, origin);
};

describe("Yjs bridge", () => {
  it("round-trips the full schema losslessly (marks, chips, tables, code, ids)", () => {
    const { update } = birthUpdate(fixture());
    const back = readPM(loadYDoc(update), schema);
    expect(back.toJSON()).toEqual(fixture().toJSON());
  });

  it("a write is a small delta that another client can apply", () => {
    const { update } = birthUpdate(fixture());
    const agent = loadYDoc(update), human = loadYDoc(update);
    const delta = edit(agent, [{ op: "replace", target: fnd(" by March"), content: tx(" by May") }]);
    expect(delta.byteLength).toBeLessThan(update.byteLength / 2);
    Y.applyUpdate(human, delta);
    expect(text(readPM(human, schema), "p1")).toContain("by May");
  });

  it("agent fills a pending block while a person edits another section: both edits survive, no conflict", () => {
    const { update } = birthUpdate(fixture());
    const agent = loadYDoc(update), human = loadYDoc(update); // two replicas of the live doc
    const agentDelta = edit(agent, [{ op: "replace", target: blocks("pe1"), content: md("## Risks\n\nVendor delay: **2 weeks**.") }]);
    const humanDelta = edit(human, [{ op: "replace", target: fnd("Closing words"), content: tx("Final words") }], "human");
    Y.applyUpdate(human, agentDelta);
    Y.applyUpdate(agent, humanDelta);
    const a = readPM(agent, schema), h = readPM(human, schema);
    expect(a.toJSON()).toEqual(h.toJSON()); // replicas converge
    expect(JSON.stringify(a.toJSON())).toContain("Vendor delay");
    expect(text(a, "p2")).toContain("Final words");
    expect(JSON.stringify(a.toJSON())).not.toContain("Risks: what could slip");
    expect(() => a.check()).not.toThrow();
  });

  it("human wins: a person edits the same block first, so the agent's guarded rewrite is refused and nothing is overwritten", () => {
    const { update } = birthUpdate(fixture());
    const live = loadYDoc(update);
    const before = readPM(live, schema);
    const staleHash = blockHash(find(before, "p2"));
    edit(live, [{ op: "replace", target: fnd("Closing words"), content: tx("Human-edited words") }], "human"); // lands before the agent writes
    const r = applyOps(readPM(live, schema), [{ op: "replace", target: blocks("p2"), ifHash: staleHash, content: md("Agent rewrite") }], { schema, ctx });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("guard_mismatch");
    expect(text(readPM(live, schema), "p2")).toContain("Human-edited words");
  });
});
