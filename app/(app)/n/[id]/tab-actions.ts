"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { roomIdFor } from "@/lib/rooms";
import { planAdd, planDelete, planMove, planNest, planStep, planUnnest, type Plan, type TabRow } from "@/lib/tabs";

export type TabResult = { ok: true; tabId?: string; nextTabId?: string } | { ok: false; code: string; fix: string };
const fail = (code: string, fix: string): TabResult => ({ ok: false, code, fix });

async function load(notebookId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, res: fail("forbidden", "Sign in first.") } as const;
  const { data: m } = await supabase.from("notebook_members").select("role").eq("notebook_id", notebookId).eq("user_id", auth.user.id).maybeSingle();
  if (!m || (m.role !== "owner" && m.role !== "editor")) return { ok: false, res: fail("forbidden", "You can't edit tabs in this notebook.") } as const;
  const { data: rows, error } = await supabase.from("tabs").select("id,name,order_key,parent_tab_id").eq("notebook_id", notebookId);
  if (error) return { ok: false, res: fail("bad_request", error.message) } as const;
  return { ok: true, supabase, rows: (rows ?? []) as TabRow[] } as const;
}

async function apply(supabase: Awaited<ReturnType<typeof createClient>>, notebookId: string, plan: Plan): Promise<TabResult> {
  if (!plan.ok) return plan;
  for (const u of plan.updates) {
    const { error } = await supabase.from("tabs").update({ parent_tab_id: u.parent_tab_id, order_key: u.order_key }).eq("id", u.id).eq("notebook_id", notebookId);
    if (error) return fail("bad_request", error.message);
  }
  if (plan.remove) {
    const { error } = await supabase.from("tabs").delete().eq("id", plan.remove).eq("notebook_id", notebookId);
    if (error) return fail("bad_request", error.message);
  }
  revalidatePath(`/n/${notebookId}`);
  return { ok: true };
}

const clean = (n: string) => n.replace(/\s+/g, " ").trim().slice(0, 80);

export async function addTab(notebookId: string, parentId: string | null, name = "New tab"): Promise<TabResult> {
  const c = await load(notebookId);
  if (!c.ok) return c.res;
  const id = randomUUID();
  const p = planAdd(c.rows, id, parentId);
  if ("ok" in p) return p;
  const { error } = await c.supabase.from("tabs").insert({ id, notebook_id: notebookId, name: clean(name) || "New tab", order_key: p.order_key, parent_tab_id: p.parent_tab_id, liveblocks_room: roomIdFor(notebookId, id) });
  if (error) return fail("bad_request", error.message);
  revalidatePath(`/n/${notebookId}`);
  return { ok: true, tabId: id };
}

export async function renameTab(notebookId: string, tabId: string, name: string): Promise<TabResult> {
  const c = await load(notebookId);
  if (!c.ok) return c.res;
  const n = clean(name);
  if (!n) return fail("bad_request", "A tab needs a name.");
  const { error } = await c.supabase.from("tabs").update({ name: n }).eq("id", tabId).eq("notebook_id", notebookId);
  if (error) return fail("bad_request", error.message);
  revalidatePath(`/n/${notebookId}`);
  return { ok: true };
}

export async function moveTab(notebookId: string, tabId: string, targetId: string, where: "before" | "after"): Promise<TabResult> {
  const c = await load(notebookId);
  return !c.ok ? c.res : apply(c.supabase, notebookId, planMove(c.rows, tabId, targetId, where));
}
export async function stepTab(notebookId: string, tabId: string, dir: "up" | "down"): Promise<TabResult> {
  const c = await load(notebookId);
  return !c.ok ? c.res : apply(c.supabase, notebookId, planStep(c.rows, tabId, dir));
}
export async function nestTab(notebookId: string, tabId: string): Promise<TabResult> {
  const c = await load(notebookId);
  return !c.ok ? c.res : apply(c.supabase, notebookId, planNest(c.rows, tabId));
}
export async function unnestTab(notebookId: string, tabId: string): Promise<TabResult> {
  const c = await load(notebookId);
  return !c.ok ? c.res : apply(c.supabase, notebookId, planUnnest(c.rows, tabId));
}

/** Refuses the last tab. Sub-tabs are promoted to top level. The Liveblocks room is kept (history stays recoverable). */
export async function deleteTab(notebookId: string, tabId: string): Promise<TabResult> {
  const c = await load(notebookId);
  if (!c.ok) return c.res;
  const plan = planDelete(c.rows, tabId);
  const r = await apply(c.supabase, notebookId, plan);
  if (!r.ok) return r;
  const first = c.rows.filter((t) => t.id !== tabId && !t.parent_tab_id).sort((a, b) => (a.order_key < b.order_key ? -1 : 1))[0] ?? c.rows.find((t) => t.id !== tabId);
  return { ok: true, nextTabId: first?.id };
}
