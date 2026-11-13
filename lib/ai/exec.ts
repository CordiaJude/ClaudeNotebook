import type { Node } from "prosemirror-model";
import { applyOps } from "@/lib/ops/engine";
import { buildBirthDoc, emptyBody } from "@/lib/ops/birth";
import { fail, OpError, type OpFailure } from "@/lib/ops/errors";
import { changesSince, outline, searchDoc, viewBlock } from "@/lib/ops/outline";
import { serverSchema } from "@/lib/ops/schema";
import { findById } from "@/lib/ops/targets";
import type { ChipMap, Op } from "@/lib/ops/types";
import { birthUpdate, loadYDoc, readPM, writePM } from "@/lib/ops/ydoc";
import type { AgentEvent } from "./events";

export type Role = "owner" | "editor" | "commenter" | "viewer";
export type TabInfo = { notebookId: string; tabId: string; room: string; role: Role; name: string };

/** Storage for each tab's live Yjs document. Real: Liveblocks. Tests: in memory. */
export interface RoomStore {
  ensure(room: string): Promise<void>;
  load(room: string): Promise<Uint8Array | null>;
  save(room: string, delta: Uint8Array): Promise<void>;
}
/** Notebook rows, accessed as the signed-in user (RLS applies). */
export interface NotebookBackend {
  createNotebook(title: string): Promise<{ notebookId: string; tabId: string; room: string }>;
  resolveTab(tabId: string): Promise<TabInfo | null>;
}

export type RunState = {
  tab?: TabInfo;
  lastRead: Map<string, string>;
  me: { id: string; name: string };
  runId: string;
};
export type ToolOutput = { content: string; isError: boolean };
export type ToolDeps = { rooms: RoomStore; backend: NotebookBackend; emit: (e: AgentEvent) => void; state: RunState };

const ok = (o: unknown): ToolOutput => ({ content: JSON.stringify({ ok: true, ...(o as object) }), isError: false });
const bad = (f: OpFailure): ToolOutput => ({ content: JSON.stringify(f), isError: true });
const schema = () => serverSchema();

async function openTab(deps: ToolDeps, tabId?: string): Promise<TabInfo> {
  const s = deps.state;
  if (tabId && tabId !== s.tab?.tabId) {
    const t = await deps.backend.resolveTab(tabId);
    if (!t) return fail("forbidden", "That tab does not exist or you do not have access to it.");
    return t;
  }
  return s.tab ?? fail("bad_request", "No notebook is open. Call notebook_create first.");
}

/** Short label for the presence pill: the pending block's intent topic, else the nearest heading above the block. */
function sectionLabel(doc: Node, id: string, pendingIntents: Map<string, string>): string {
  const intent = pendingIntents.get(id);
  if (intent) return intent.split(":")[0]!.slice(0, 40);
  let label = "Intro";
  let seen = false;
  doc.forEach((n) => {
    if (seen) return;
    if (n.attrs.id === id) seen = true;
    else if (n.type.name === "heading" || n.type.name === "title") label = n.textContent.slice(0, 40) || label;
  });
  return seen ? label : "Document";
}

export function makeToolRunner(deps: ToolDeps) {
  const { rooms, backend, emit, state } = deps;

  async function create(input: { title?: string; markdown?: string; blocks?: ChipMap }): Promise<ToolOutput> {
    const doc = buildBirthDoc(schema(), { title: input.title, markdown: input.markdown ?? "", blocks: input.blocks }, { me: state.me });
    const title = doc.child(0).textContent || "Untitled";
    const nb = await backend.createNotebook(title);
    await rooms.ensure(nb.room);
    await rooms.save(nb.room, birthUpdate(doc).update);
    state.tab = { notebookId: nb.notebookId, tabId: nb.tabId, room: nb.room, role: "owner", name: "Main" };
    const o = outline(doc);
    state.lastRead = o.hashes;
    emit({ type: "created", notebookId: nb.notebookId, tabId: nb.tabId });
    return ok({ notebookId: nb.notebookId, tabId: nb.tabId, blocks: o.text });
  }

  async function read(input: { mode?: string; parentId?: string; text?: string; tabId?: string }): Promise<ToolOutput> {
    const tab = await openTab(deps, input.tabId);
    const ydoc = loadYDoc(await rooms.load(tab.room));
    const doc = readPM(ydoc, schema());
    const mode = input.mode ?? "outline";
    if (mode === "outline") {
      const o = outline(doc);
      state.lastRead = o.hashes;
      return ok({ tabId: tab.tabId, blocks: o.text });
    }
    if (mode === "view") {
      if (!input.parentId) fail("bad_request", 'mode "view" needs parentId (a block id from the outline).');
      const f = findById(doc, input.parentId!) ?? fail("block_gone", `Block ${input.parentId} does not exist (it may have been deleted).`, { path: input.parentId });
      const v = viewBlock(f.node);
      state.lastRead.set(input.parentId!, (v.match(/ h="([0-9a-f]{8})"/) ?? [])[1] ?? "");
      return ok({ view: v.length > 12_000 ? v.slice(0, 12_000) + "\n…(truncated: view a smaller block)" : v });
    }
    if (mode === "search") {
      if (!input.text) fail("bad_request", 'mode "search" needs text.');
      return ok({ hits: searchDoc(doc, input.text!) });
    }
    if (mode === "changes") {
      const c = changesSince(doc, state.lastRead);
      state.lastRead = c.now;
      return ok({ changed: c.changed, added: c.added, removed: c.gone });
    }
    return fail("bad_request", 'mode must be "outline", "view", "search" or "changes".');
  }

  async function edit(input: { ops?: Op[]; mode?: string; tabId?: string }): Promise<ToolOutput> {
    if (input.mode && input.mode !== "direct") fail("bad_request", 'Only mode "direct" is available now.');
    const tab = await openTab(deps, input.tabId);
    if (tab.role !== "owner" && tab.role !== "editor") fail("forbidden", "You can only comment in this notebook, not edit it.");
    const ydoc = loadYDoc(await rooms.load(tab.room)); // fresh copy of the live doc: the guards run against what people have now
    const before = readPM(ydoc, schema());
    const pendingIntents = new Map<string, string>();
    before.forEach((n) => { if (n.type.name === "pending") pendingIntents.set(n.attrs.id as string, String(n.attrs.intent ?? "")); });
    const r = applyOps(before, input.ops ?? [], { schema: schema(), ctx: { me: state.me } });
    if (!r.ok) return bad(r);
    const delta = writePM(ydoc, r.doc, `agent:${state.runId}`);
    await rooms.save(tab.room, delta);
    for (const t of r.touched) state.lastRead.set(t.id, t.h);
    for (const id of r.removed) state.lastRead.delete(id);
    const first = r.touched[0];
    const filled = (input.ops ?? []).flatMap((o) => (o.op === "replace" && o.target.kind === "blocks" ? o.target.ids : [])).find((id) => pendingIntents.has(id));
    emit({ type: "section", label: filled ? sectionLabel(before, filled, pendingIntents) : first ? sectionLabel(r.doc, first.id, new Map()) : "Document" });
    return ok({ touched: r.touched, removed: r.removed, detached: r.detached });
  }

  return async function run(name: string, input: unknown): Promise<ToolOutput> {
    try {
      switch (name) {
        case "notebook_create": return await create(input as Parameters<typeof create>[0]);
        case "notebook_read": return await read((input ?? {}) as Parameters<typeof read>[0]);
        case "notebook_edit": return await edit((input ?? {}) as Parameters<typeof edit>[0]);
        default: return bad({ ok: false, code: "bad_request", fix: `Unknown tool "${name}". Available: notebook_create, notebook_read, notebook_edit.` });
      }
    } catch (e) {
      if (e instanceof OpError) return bad(e.failure);
      return bad({ ok: false, code: "bad_request", fix: `The tool failed (${e instanceof Error ? e.message.slice(0, 160) : "unknown"}). Try again or tell the person.` });
    }
  };
}

export { emptyBody };
