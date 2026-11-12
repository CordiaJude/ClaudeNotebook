import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { applyUpdates, flatten, planAdd, planDelete, planMove, planNest, planStep, planUnnest, type TabRow } from "@/lib/tabs";

const mk = (names: string[]): TabRow[] => {
  let rows: TabRow[] = [];
  for (const n of names) {
    const a = planAdd(rows, n);
    if ("ok" in a) throw new Error("add failed");
    rows = [...rows, { id: n, name: n, order_key: a.order_key, parent_tab_id: a.parent_tab_id }];
  }
  return rows;
};
const order = (rows: TabRow[]) => flatten(rows).map((r) => (r.depth ? "  " : "") + r.id);
const ok = <T extends { ok: boolean }>(p: T) => { if (!p.ok) throw new Error(JSON.stringify(p)); return p as Extract<T, { ok: true }>; };

describe("F01/F02 tabs", () => {
  it("adds tabs in order with string keys", () => {
    expect(order(mk(["a", "b", "c"]))).toEqual(["a", "b", "c"]);
  });
  it("refuses deleting the last tab", () => {
    const p = planDelete(mk(["a"]), "a");
    expect(p).toMatchObject({ ok: false, code: "last_tab" });
  });
  it("deletes a leaf", () => {
    const rows = mk(["a", "b"]);
    const p = ok(planDelete(rows, "a"));
    expect(p.remove).toBe("a");
    expect(p.updates).toEqual([]);
  });
  it("nests under the previous sibling and unnests back after the parent", () => {
    let rows = mk(["a", "b", "c"]);
    rows = applyUpdates(rows, ok(planNest(rows, "b")).updates);
    expect(order(rows)).toEqual(["a", "  b", "c"]);
    rows = applyUpdates(rows, ok(planUnnest(rows, "b")).updates);
    expect(order(rows)).toEqual(["a", "b", "c"]);
  });
  it("first tab cannot nest; sub-tabs cannot nest further; parents with sub-tabs cannot nest", () => {
    let rows = mk(["a", "b", "c"]);
    expect(planNest(rows, "a")).toMatchObject({ ok: false, code: "no_prev_sibling" });
    rows = applyUpdates(rows, ok(planNest(rows, "b")).updates); // a > b
    expect(planNest(rows, "b")).toMatchObject({ ok: false, code: "too_deep" }); // already a sub-tab
    expect(planNest(rows, "a")).toMatchObject({ ok: false, code: "too_deep" }); // a has a sub-tab
    expect(planNest(rows, "c").ok).toBe(true); // c nests under a
  });
  it("deleting a parent promotes its sub-tabs to top level, in place", () => {
    let rows = mk(["a", "b", "c", "d"]);
    rows = applyUpdates(rows, ok(planNest(rows, "b")).updates); // a > b
    rows = applyUpdates(rows, ok(planNest(rows, "c")).updates); // a > b, c
    expect(order(rows)).toEqual(["a", "  b", "  c", "d"]);
    const p = ok(planDelete(rows, "a"));
    rows = applyUpdates(rows, p.updates).filter((r) => r.id !== p.remove);
    expect(order(rows)).toEqual(["b", "c", "d"]);
    expect(rows.every((r) => r.parent_tab_id === null)).toBe(true);
  });
  it("reorders by moving before/after and by step", () => {
    let rows = mk(["a", "b", "c"]);
    rows = applyUpdates(rows, ok(planMove(rows, "c", "a", "before")).updates);
    expect(order(rows)).toEqual(["c", "a", "b"]);
    rows = applyUpdates(rows, ok(planStep(rows, "c", "down")).updates);
    expect(order(rows)).toEqual(["a", "c", "b"]);
    expect(ok(planStep(rows, "a", "up")).updates).toEqual([]);
  });
  it("dropping onto a sub-tab makes it a sub-tab, unless it has its own sub-tabs", () => {
    let rows = mk(["a", "b", "c", "d"]);
    rows = applyUpdates(rows, ok(planNest(rows, "b")).updates); // a > b ; top: a, c, d
    expect(order(applyUpdates(rows, ok(planMove(rows, "c", "b", "after")).updates))).toEqual(["a", "  b", "  c", "d"]);
    rows = applyUpdates(rows, ok(planNest(rows, "d")).updates); // d nests under c: a > b ; c > d
    expect(planMove(rows, "c", "b", "after")).toMatchObject({ ok: false, code: "too_deep" }); // c has sub-tab d
  });
  it("sub-tabs under a sub-tab are refused at add", () => {
    let rows = mk(["a", "b"]); rows = applyUpdates(rows, ok(planNest(rows, "b")).updates);
    expect(planAdd(rows, "x", "b")).toMatchObject({ ok: false, code: "too_deep" });
  });
});

describe("tab ops never corrupt the tree (property test)", () => {
  type Act = { k: "add" | "del" | "nest" | "unnest" | "up" | "down"; i: number };
  it("keys stay unique per level; no orphans; never empty; depth <= 1", () => {
    fc.assert(
      fc.property(fc.array(fc.record({ k: fc.constantFrom("add", "del", "nest", "unnest", "up", "down"), i: fc.nat(20) }), { maxLength: 60 }), (acts: Act[]) => {
        let rows = mk(["t0"]);
        let n = 1;
        for (const a of acts) {
          const target = rows[a.i % rows.length]!;
          if (a.k === "add") { const id = `t${n++}`; const p = planAdd(rows, id, null); if (!("ok" in p)) rows = [...rows, { name: id, ...p }]; }
          else if (a.k === "del") { const p = planDelete(rows, target.id); if (p.ok) rows = applyUpdates(rows, p.updates).filter((r) => r.id !== p.remove); }
          else { const p = a.k === "nest" ? planNest(rows, target.id) : a.k === "unnest" ? planUnnest(rows, target.id) : planStep(rows, target.id, a.k); if (p.ok) rows = applyUpdates(rows, p.updates); }
        }
        expect(rows.length).toBeGreaterThan(0);
        const ids = new Set(rows.map((r) => r.id));
        for (const r of rows) {
          if (r.parent_tab_id) { expect(ids.has(r.parent_tab_id)).toBe(true); expect(rows.find((x) => x.id === r.parent_tab_id)!.parent_tab_id).toBeNull(); }
        }
        const levels = new Map<string | null, string[]>();
        rows.forEach((r) => levels.set(r.parent_tab_id, [...(levels.get(r.parent_tab_id) ?? []), r.order_key]));
        for (const keys of levels.values()) expect(new Set(keys).size).toBe(keys.length);
        expect(flatten(rows).length).toBe(rows.length);
      }),
      { numRuns: 300 },
    );
  });
});
