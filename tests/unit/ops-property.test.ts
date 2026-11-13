import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Node } from "prosemirror-model";
import { applyOps } from "@/lib/ops/engine";
import { blockHash } from "@/lib/ops/hash";
import type { Op } from "@/lib/ops/types";
import { ctx, fixture, schema } from "./ops-helpers";

const ids = (doc: Node) => { const a: string[] = []; doc.descendants((n) => { if (n.attrs.id) a.push(n.attrs.id as string); }); return a; };
const commentChars = (doc: Node) => { let n = 0; doc.descendants((x) => { if (x.isText && x.marks.some((m) => m.type.name === "comment")) n += x.text!.length; }); return n; };
const byId = (doc: Node, id: string) => { let f: Node | null = null; doc.descendants((n) => { if (n.attrs.id === id) f = n; }); return f as Node | null; };
const words = ["launch", "March", "Goals", "Vendor", "plan", "Ship", "nothing-here", "Closing words", "x"];

type Pick = { k: number; a: number; b: number; w: number; good: boolean; txt: string };
const pick = fc.record({ k: fc.integer({ min: 0, max: 11 }), a: fc.nat(40), b: fc.nat(40), w: fc.nat(8), good: fc.boolean(), txt: fc.constantFrom("Alpha beta.", "## Heading\n\nbody", "- a\n- b", "| h |\n|---|\n| c |", "<?cn block z?>", "   ", "**bold** text") });

function toOp(doc: Node, p: Pick): Op {
  const all = ids(doc);
  const idA = all[p.a % all.length]!, idB = all[p.b % all.length]!;
  const g = (id: string) => (p.good ? blockHash(byId(doc, id) ?? doc) : "deadbeef");
  const content = { as: "markdown" as const, from: { kind: "inline" as const, content: p.txt } };
  switch (p.k) {
    case 0: return { op: "replace", target: { kind: "find", text: words[p.w]!, nth: 1 }, content: { as: "text", from: { kind: "inline", content: p.txt } } };
    case 1: return { op: "replace", target: { kind: "blocks", ids: [idA] }, ifHash: g(idA), content };
    case 2: return { op: "insert", target: { kind: "blocks", ids: [idA] }, side: p.good ? "after" : "before", content };
    case 3: return { op: "delete", target: { kind: "blocks", ids: [idA] }, ifHash: g(idA) };
    case 4: return { op: "move", target: { kind: "blocks", ids: [idA] }, to: { kind: "blocks", ids: [idB] }, side: p.good ? "after" : "before" };
    case 5: return { op: "set", target: { kind: "blocks", ids: [idA] }, attrs: { heading: [1, 2, 3, null][p.w % 4] } };
    case 6: return { op: "wrap", target: { kind: "blocks", ids: [idA] }, with: (["blockquote", "bulletList", "taskList"] as const)[p.w % 3]! };
    case 7: return { op: "unwrap", target: { kind: "blocks", ids: [idA] } };
    case 8: return { op: "join", target: { kind: "blocks", ids: [idA, idB] } };
    case 9: return { op: "insert", target: { kind: "root" }, side: p.good ? "end" : "start", content };
    case 10: return { op: "delete", target: { kind: "find", text: words[p.w]! } };
    default: return { op: "set", target: { kind: "blocks", ids: [idA] }, attrs: { kind: ["bullet", "ordered", "task"][p.w % 3] } };
  }
}

describe("op engine never corrupts the document (property test)", () => {
  it("failures change nothing; successes keep structure, unique ids and every comment anchor (or report detach)", () => {
    fc.assert(
      fc.property(fc.array(pick, { minLength: 1, maxLength: 25 }), (picks) => {
        let doc = fixture();
        for (const p of picks) {
          const before = JSON.stringify(doc.toJSON());
          const r = applyOps(doc, [toOp(doc, p)], { schema, ctx });
          if (!r.ok) {
            expect(JSON.stringify(doc.toJSON())).toBe(before); // atomic: input untouched
            expect(r.fix.length).toBeGreaterThan(5);
            continue;
          }
          expect(() => r.doc.check()).not.toThrow();
          expect(r.doc.child(0).type.name).toBe("title");
          expect(r.doc.child(1).type.name).toBe("byline");
          expect(r.doc.childCount).toBeGreaterThanOrEqual(3);
          const all = ids(r.doc);
          expect(new Set(all).size).toBe(all.length);
          if (commentChars(r.doc) < commentChars(doc)) expect(r.detached.length).toBeGreaterThan(0); // never lose an anchor silently
          doc = r.doc;
        }
      }),
      { numRuns: Number(process.env.PROP_RUNS ?? 800) },
    );
  }, 120_000);
});
