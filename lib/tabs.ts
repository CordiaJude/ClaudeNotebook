import { generateKeyBetween } from "fractional-indexing";

export type TabRow = { id: string; name: string; order_key: string; parent_tab_id: string | null };
export type TabError = "last_tab" | "too_deep" | "no_prev_sibling" | "not_nested" | "tab_none" | "bad_request";
export type Fail = { ok: false; code: TabError; fix: string };
export type KeyUpdate = { id: string; parent_tab_id: string | null; order_key: string };
export type Plan = { ok: true; updates: KeyUpdate[]; remove?: string } | Fail;

const fail = (code: TabError, fix: string): Fail => ({ ok: false, code, fix });
const byKey = (a: TabRow, b: TabRow) => (a.order_key < b.order_key ? -1 : a.order_key > b.order_key ? 1 : a.id < b.id ? -1 : 1);

/** Max nesting: top level + one level of sub-tabs. */
export const MAX_DEPTH = 1;

export const siblings = (rows: TabRow[], parent: string | null) => rows.filter((r) => r.parent_tab_id === parent).sort(byKey);
export const children = (rows: TabRow[], id: string) => siblings(rows, id);

/** Display order: each top-level tab followed by its sub-tabs. Orphans (parent missing) are treated as top level. */
export function flatten(rows: TabRow[]): (TabRow & { depth: number })[] {
  const ids = new Set(rows.map((r) => r.id));
  const top = rows.filter((r) => !r.parent_tab_id || !ids.has(r.parent_tab_id)).sort(byKey);
  return top.flatMap((t) => [{ ...t, depth: 0 }, ...children(rows, t.id).map((c) => ({ ...c, depth: 1 }))]);
}

/** Key that sorts after `afterId` (or first, when null) among the siblings under `parent`. */
export function keyAfter(rows: TabRow[], parent: string | null, afterId: string | null, excludeId?: string): string {
  const sibs = siblings(rows, parent).filter((s) => s.id !== excludeId);
  if (afterId === null) return generateKeyBetween(null, sibs[0]?.order_key ?? null);
  const i = sibs.findIndex((s) => s.id === afterId);
  if (i < 0) return generateKeyBetween(sibs.at(-1)?.order_key ?? null, null);
  return generateKeyBetween(sibs[i]!.order_key, sibs[i + 1]?.order_key ?? null);
}

export function planAdd(rows: TabRow[], id: string, parent: string | null = null): { id: string; parent_tab_id: string | null; order_key: string } | Fail {
  if (parent) {
    const p = rows.find((r) => r.id === parent);
    if (!p) return fail("tab_none", "Parent tab does not exist.");
    if (p.parent_tab_id) return fail("too_deep", "Sub-tabs cannot have their own sub-tabs.");
  }
  const last = siblings(rows, parent).at(-1);
  return { id, parent_tab_id: parent, order_key: keyAfter(rows, parent, last?.id ?? null) };
}

/** Deleting the last tab is refused. Sub-tabs of a deleted parent are promoted to top level, in place. */
export function planDelete(rows: TabRow[], id: string): Plan {
  const t = rows.find((r) => r.id === id);
  if (!t) return fail("tab_none", "That tab no longer exists.");
  if (rows.length <= 1) return fail("last_tab", "A notebook needs at least one tab.");
  const kids = children(rows, id);
  const updates: KeyUpdate[] = [];
  if (kids.length) {
    // Insert the promoted kids right where the parent was: between parent and its next top-level sibling.
    const top = siblings(rows, null);
    const next = top[top.findIndex((s) => s.id === id) + 1];
    let prev = t.order_key;
    for (const k of kids) {
      const key = generateKeyBetween(prev, next?.order_key ?? null);
      updates.push({ id: k.id, parent_tab_id: null, order_key: key });
      prev = key;
    }
  }
  return { ok: true, updates, remove: id };
}

/** Indent: become the last sub-tab of the previous top-level sibling. */
export function planNest(rows: TabRow[], id: string): Plan {
  const t = rows.find((r) => r.id === id);
  if (!t) return fail("tab_none", "That tab no longer exists.");
  if (t.parent_tab_id) return fail("too_deep", "Already a sub-tab; sub-tabs cannot nest further.");
  if (children(rows, id).length) return fail("too_deep", "This tab has sub-tabs; move them out first.");
  const top = siblings(rows, null);
  const prev = top[top.findIndex((s) => s.id === id) - 1];
  if (!prev) return fail("no_prev_sibling", "The first tab has nothing to nest under.");
  return { ok: true, updates: [{ id, parent_tab_id: prev.id, order_key: keyAfter(rows, prev.id, children(rows, prev.id).at(-1)?.id ?? null) }] };
}

/** Outdent: become a top-level tab right after its former parent. */
export function planUnnest(rows: TabRow[], id: string): Plan {
  const t = rows.find((r) => r.id === id);
  if (!t) return fail("tab_none", "That tab no longer exists.");
  if (!t.parent_tab_id) return fail("not_nested", "Already a top-level tab.");
  return { ok: true, updates: [{ id, parent_tab_id: null, order_key: keyAfter(rows, null, t.parent_tab_id) }] };
}

/** Drop `id` before/after `targetId`; it joins the target's level. */
export function planMove(rows: TabRow[], id: string, targetId: string, where: "before" | "after"): Plan {
  const t = rows.find((r) => r.id === id);
  const target = rows.find((r) => r.id === targetId);
  if (!t || !target) return fail("tab_none", "That tab no longer exists.");
  if (id === targetId) return fail("bad_request", "Cannot move a tab relative to itself.");
  const parent = target.parent_tab_id;
  if (parent && children(rows, id).length) return fail("too_deep", "A tab with sub-tabs cannot become a sub-tab.");
  if (parent === id) return fail("bad_request", "Cannot move a tab into its own sub-tab.");
  const sibs = siblings(rows, parent).filter((s) => s.id !== id);
  const ti = sibs.findIndex((s) => s.id === targetId);
  const lo = where === "before" ? sibs[ti - 1] : sibs[ti];
  const hi = where === "before" ? sibs[ti] : sibs[ti + 1];
  return { ok: true, updates: [{ id, parent_tab_id: parent, order_key: generateKeyBetween(lo?.order_key ?? null, hi?.order_key ?? null) }] };
}

/** Up/down within the current level. */
export function planStep(rows: TabRow[], id: string, dir: "up" | "down"): Plan {
  const t = rows.find((r) => r.id === id);
  if (!t) return fail("tab_none", "That tab no longer exists.");
  const sibs = siblings(rows, t.parent_tab_id);
  const i = sibs.findIndex((s) => s.id === id);
  const other = sibs[dir === "up" ? i - 1 : i + 1];
  if (!other) return { ok: true, updates: [] };
  return planMove(rows, id, other.id, dir === "up" ? "before" : "after");
}

export const applyUpdates = (rows: TabRow[], updates: KeyUpdate[]): TabRow[] =>
  rows.map((r) => { const u = updates.find((x) => x.id === r.id); return u ? { ...r, parent_tab_id: u.parent_tab_id, order_key: u.order_key } : r; });
