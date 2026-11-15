/* One AI request, start to finish: check the person may edit, count it, let the model work through tools,
   stream progress, and leave a record that can be undone in one step. */
import { dropUnwritten, undoAll, type UndoEntry } from "@/lib/doc/edit";
import { isBlank, outline } from "@/lib/doc/read";
import { describeSelection, resolveScope } from "@/lib/doc/range";
import type { Scope } from "@/lib/doc/scope";
import { docSchema } from "@/lib/doc/schema";
import { loadYDoc, readDoc, writeDoc } from "@/lib/doc/ydoc";
import { DataError, canEdit, type Data, type Message, type Tab, type User } from "@/lib/data/types";
import type { RoomStore } from "@/lib/rooms/types";
import { CHAT_SYSTEM, SELECTION_SYSTEM } from "./prompt";
import { CHAT_TOOLS, SELECTION_TOOLS, runTool, type ToolCtx } from "./tools";
import type { Block, Model, Msg, RunEvent } from "./types";

export type Deps = { user: User; data: Data; rooms: RoomStore; model: Model; signal?: AbortSignal; today?: string };
export type ChatRequest = { artifactId: string; message?: string; answers?: { messageId: string; values: Record<string, string> | "skipped" } };
export const MAX_TURNS = 30;
/** Runs in progress in this process, so a Stop request can reach them. */
const g = globalThis as typeof globalThis & { __activeRuns?: Map<string, AbortController> };
const active = (g.__activeRuns ??= new Map<string, AbortController>());
/** Stop a run the person started. True when it was running here. The stream then ends by itself with what was kept. */
export async function stopRun(runId: string, d: Pick<Deps, "user" | "data">): Promise<boolean> {
  const run = await d.data.getRun(d.user.id, runId);
  if (!run) throw new DataError("not_found", "That request was not found.");
  const ctl = active.get(runId);
  ctl?.abort();
  return !!ctl;
}
export const MAX_MESSAGE = 8000;
const NO_EDIT = "You can view this, not change it. Ask the owner for edit access to use AI here.";

async function gate(d: Deps, artifactId: string): Promise<Tab> {
  const found = await d.data.getArtifact(d.user.id, artifactId);
  if (!found) throw new DataError("not_found", "That doc was not found, or it is not shared with you.");
  if (!canEdit(found.artifact.role)) throw new DataError("forbidden", NO_EDIT);
  if (found.artifact.kind !== "doc" || !found.tabs[0]) throw new DataError("invalid", "AI drafting for slides is not built yet.");
  return found.tabs[0];
}

async function currentDoc(d: Deps, tab: Tab) {
  const state = await d.rooms.read(tab.room);
  if (!state) throw new DataError("not_found", "The document could not be opened.");
  const ydoc = loadYDoc(state);
  return { ydoc, doc: readDoc(ydoc, docSchema()) };
}

/** The conversation as the model sees it. Stored messages become plain turns; the newest one carries the document's state. */
export function toModelMessages(history: Message[], context: string): Msg[] {
  const out: Msg[] = [];
  const push = (role: Msg["role"], text: string) => { const last = out.at(-1); if (last && last.role === role) last.content = `${last.content as string}\n\n${text}`; else out.push({ role, content: text }); };
  for (const m of history.slice(-16)) {
    const c = m.content;
    if (c.kind === "text") push(m.role, m.role === "user" ? `[Request]\n${c.text}` : c.text);
    else if (c.kind === "questions") push("assistant", `I asked the person:\n${c.questions.map((q) => `- ${q.prompt}${q.options ? ` (${q.options.join(" / ")})` : ""}`).join("\n")}`);
    else if (c.kind === "answers") push("user", `[Answers]\n${c.values === "skipped" ? "The person skipped the questions. Draft with sensible defaults." : Object.entries(c.values).map(([k, v]) => `${k}: ${v}`).join("\n")}`);
  }
  while (out.length && out[0]!.role !== "user") out.shift();
  const last = out.at(-1);
  if (last?.role === "user") last.content = `[Context]\n${context}\n\n${last.content as string}`;
  return out;
}

/** Validates, then returns a stream of events. Anything wrong before work starts is thrown as a DataError (a 4xx), not streamed. */
export async function startChatRun(req: ChatRequest, d: Deps): Promise<ReadableStream<Uint8Array>> {
  const text = req.message?.trim() ?? "";
  if (!req.answers && !text) throw new DataError("invalid", "Write a message first.");
  if (text.length > MAX_MESSAGE) throw new DataError("invalid", "That message is too long. Keep it under 8,000 characters.");
  const tab = await gate(d, req.artifactId);
  if (!(await d.data.tryStartRun(d.user.id))) throw new DataError("limit", "You have used today's AI allowance. It resets at midnight UTC.");

  let userMessage: Message;
  if (req.answers) {
    const asked = (await d.data.messages(d.user.id, req.artifactId)).find((m) => m.id === req.answers!.messageId && m.content.kind === "questions");
    if (!asked || asked.content.kind !== "questions") throw new DataError("invalid", "Those questions are no longer waiting for an answer.");
    await d.data.updateMessage(d.user.id, req.artifactId, asked.id, { content: { ...asked.content, answered: req.answers.values } });
    userMessage = await d.data.addMessage(d.user.id, req.artifactId, { role: "user", content: { kind: "answers", values: req.answers.values } });
  } else userMessage = await d.data.addMessage(d.user.id, req.artifactId, { role: "user", content: { kind: "text", text } });

  const run = await d.data.openRun({ artifactId: req.artifactId, tabId: tab.id, userId: d.user.id, mode: "chat" });
  const { doc } = await currentDoc(d, tab);
  const context = `Today: ${d.today ?? new Date().toISOString().slice(0, 10)}\nPerson: ${d.user.name}\n${isBlank(doc) ? "Document: blank" : `Document outline:\n${outline(doc)}`}`;
  const messages = toModelMessages(await d.data.messages(d.user.id, req.artifactId), context);

  const abort = new AbortController();
  d.signal?.addEventListener("abort", () => abort.abort(), { once: true });
  active.set(run.id, abort);
  const enc = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (e: RunEvent) => { if (!open) return; try { controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { open = false; } };
      const ctx: ToolCtx = { data: d.data, rooms: d.rooms, userId: d.user.id, artifactId: req.artifactId, tab, runId: run.id, undo: [], emit, sections: [], written: 0 };
      const keep = async (content: Message["content"]) => {
        const m = await d.data.addMessage(d.user.id, req.artifactId, { role: "assistant", content, runId: run.id, undoable: ctx.undo.length > 0 && content.kind !== "questions" });
        emit({ type: "message", message: m });
      };
      let status: "done" | "stopped" | "awaiting_answers" | "error" = "done";
      const usage = { input: 0, output: 0 };
      emit({ type: "start", runId: run.id, userMessage });
      try {
        let reply = "";
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const t = await d.model.turn({ system: CHAT_SYSTEM, tools: CHAT_TOOLS, messages, signal: abort.signal, effort: "medium", onText: (delta) => emit({ type: "text", delta }) });
          usage.input += t.usage.input; usage.output += t.usage.output;
          messages.push({ role: "assistant", content: t.blocks, raw: t.raw });
          // A turn cut off by a length limit or declined by the model may carry half a tool call: never run those.
          if (t.stop === "refused") { reply = "The AI declined this request. Nothing was changed by it."; break; }
          if (t.stop === "limit") throw new Error("the model's reply was cut off before it finished");
          reply = t.blocks.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim() || reply;
          const calls = t.blocks.filter((b) => b.type === "tool_use") as Extract<Block, { type: "tool_use" }>[];
          if (calls.length === 0) break;
          const results: Block[] = [];
          for (const c of calls) {
            if (abort.signal.aborted) throw new DOMException("stopped", "AbortError");
            const r = await runTool(ctx, c.name, c.input);
            results.push({ type: "tool_result", tool_use_id: c.id, content: r.content, ...(r.isError ? { is_error: true } : {}) });
          }
          messages.push({ role: "user", content: results });
          if (ctx.asked) break;
        }
        if (ctx.asked) { status = "awaiting_answers"; await keep({ kind: "questions", questions: ctx.asked }); }
        else await keep({ kind: "text", text: reply || (ctx.undo.length ? "Done." : "Nothing was changed.") });
      } catch (e) {
        status = abort.signal.aborted ? "stopped" : "error";
        // Leave no half-finished page: placeholders that were never written go, what was written stays.
        try {
          const { ydoc, doc: now } = await currentDoc(d, tab);
          const clean = dropUnwritten(now);
          if (clean !== now && canEdit(await d.data.roleOn(d.user.id, req.artifactId))) await d.rooms.apply(tab.room, writeDoc(ydoc, clean, `ai:${run.id}`), `ai:${run.id}`);
        } catch { /* the document stays as it is */ }
        const kept = ctx.written > 0 ? " What was written so far is kept." : "";
        if (status === "stopped") await keep({ kind: "text", text: `Stopped.${kept}`, stopped: true }).catch(() => {});
        else { await keep({ kind: "error", text: `That did not go through.${kept}` }).catch(() => {}); emit({ type: "error", message: e instanceof Error ? e.message : "error" }); }
      } finally {
        active.delete(run.id);
        await d.data.updateRun(run.id, { status, undo: ctx.undo, finishedAt: new Date().toISOString(), model: d.model.name, inputTokens: usage.input, outputTokens: usage.output }).catch(() => {});
        emit({ type: "done", status });
        open = false;
        try { controller.close(); } catch { /* already closed by the client */ }
      }
    },
    cancel() { abort.abort(); },
  });
}

export type SelectionResult = { ok: true; runId: string; messages: Message[] } | { ok: false; message: string };
/** "Edit with AI": the model sees only the selection, has one tool, and the server makes the one replacement itself. */
export async function runSelectionEdit(req: { artifactId: string; scope: Scope; instruction: string }, d: Deps): Promise<SelectionResult> {
  const instruction = req.instruction?.trim() ?? "";
  if (!instruction) throw new DataError("invalid", "Say what should change.");
  if (instruction.length > 2000) throw new DataError("invalid", "That instruction is too long.");
  const s = req.scope;
  if (!s || typeof s.startBlock !== "string" || typeof s.endBlock !== "string" || !Number.isInteger(s.startOffset) || !Number.isInteger(s.endOffset) || typeof s.text !== "string") throw new DataError("invalid", "Select some text first.");
  const tab = await gate(d, req.artifactId);
  const { doc } = await currentDoc(d, tab);
  const at = resolveScope(doc, s);
  if (!at.ok) return { ok: false, message: at.message };
  const sel = describeSelection(doc, at.from, at.to);
  if (!sel.ok) return { ok: false, message: sel.message };
  if (!(await d.data.tryStartRun(d.user.id))) throw new DataError("limit", "You have used today's AI allowance. It resets at midnight UTC.");

  const run = await d.data.openRun({ artifactId: req.artifactId, tabId: tab.id, userId: d.user.id, mode: "selection", scope: s });
  const ctx: ToolCtx = { data: d.data, rooms: d.rooms, userId: d.user.id, artifactId: req.artifactId, tab, runId: run.id, undo: [], emit: () => {}, scope: s, sections: [], written: 0 };
  const messages: Msg[] = [{ role: "user", content: `[Context]\nThe selection is ${sel.inline ? "part of one paragraph: reply with a single line" : "one or more whole blocks"}.\nText before it (do not change or repeat): ${JSON.stringify(sel.before)}\nText after it (do not change or repeat): ${JSON.stringify(sel.after)}\n[Selected text]\n<<<\n${sel.markdown}\n>>>\n[Instruction]\n${instruction}` }];
  const signal = d.signal ?? new AbortController().signal;
  let failure = "The AI did not change the selection.";
  const usage = { input: 0, output: 0 };
  const spent = () => ({ model: d.model.name, inputTokens: usage.input, outputTokens: usage.output });
  try {
    for (let turn = 0; turn < 3 && ctx.undo.length === 0; turn++) {
      const t = await d.model.turn({ system: SELECTION_SYSTEM, tools: SELECTION_TOOLS, messages, signal, effort: "low" });
      usage.input += t.usage.input; usage.output += t.usage.output;
      messages.push({ role: "assistant", content: t.blocks, raw: t.raw });
      if (t.stop === "refused") { failure = "The AI declined this request. Nothing was changed."; break; }
      if (t.stop === "limit") { failure = "The AI's reply was cut off. Nothing was changed. Try a shorter selection."; break; }
      const call = t.blocks.find((b) => b.type === "tool_use") as Extract<Block, { type: "tool_use" }> | undefined;
      if (!call) { failure = t.blocks.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join(" ").trim() || failure; break; }
      if (signal.aborted) throw new DOMException("stopped", "AbortError");
      // Whatever the model calls, only replace_selection exists in this mode.
      const r = call.name === "replace_selection" ? await runTool(ctx, call.name, call.input) : { content: "Only replace_selection is available.", isError: true };
      if (r.isError) failure = r.content;
      messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: call.id, content: r.content, ...(r.isError ? { is_error: true } : {}) }] });
    }
  } catch (e) {
    await d.data.updateRun(run.id, { status: signal.aborted ? "stopped" : "error", finishedAt: new Date().toISOString() });
    if (signal.aborted) return { ok: false, message: "Stopped. Nothing was changed." };
    throw e;
  }
  if (ctx.undo.length === 0) { await d.data.updateRun(run.id, { status: "error", finishedAt: new Date().toISOString(), ...spent() }); return { ok: false, message: failure }; }
  await d.data.updateRun(run.id, { status: "done", undo: ctx.undo, finishedAt: new Date().toISOString(), ...spent() });
  const quote = s.text.replace(/\s+/g, " ").trim();
  const asked = await d.data.addMessage(d.user.id, req.artifactId, { role: "user", content: { kind: "text", text: `Edit “${quote.length > 60 ? quote.slice(0, 59) + "…" : quote}”: ${instruction}` } });
  const did = await d.data.addMessage(d.user.id, req.artifactId, { role: "assistant", content: { kind: "text", text: "Rewrote the selected text. Nothing else changed." }, runId: run.id, undoable: true });
  return { ok: true, runId: run.id, messages: [asked, did] };
}

export type UndoResult = { ok: true } | { ok: false; conflicts: string[] };
/** Put back everything one run changed. A new edit, made as the same person, so it merges like any other. */
export async function undoRun(runId: string, force: boolean, d: Omit<Deps, "model">): Promise<UndoResult> {
  const run = await d.data.getRun(d.user.id, runId);
  if (!run) throw new DataError("not_found", "That change was not found.");
  if (run.undoneAt) throw new DataError("conflict", "That change was already undone.");
  if (run.undo.length === 0) throw new DataError("invalid", "That request did not change the document.");
  const found = await d.data.getArtifact(d.user.id, run.artifactId);
  if (!found) throw new DataError("not_found", "That doc was not found, or it is not shared with you.");
  if (!canEdit(found.artifact.role)) throw new DataError("forbidden", NO_EDIT);
  const tab = found.tabs.find((t) => t.id === run.tabId) ?? found.tabs[0]!;
  const { ydoc, doc } = await currentDoc({ ...d, model: null as never }, tab);
  const res = undoAll(doc, run.undo as UndoEntry[], { force });
  if (!res.ok) return res;
  await d.rooms.apply(tab.room, writeDoc(ydoc, res.doc, `undo:${run.id}`), `undo:${run.id}`);
  await d.data.updateRun(run.id, { undoneAt: new Date().toISOString() });
  const msg = (await d.data.messages(d.user.id, run.artifactId)).find((m) => m.runId === run.id && m.undoable);
  if (msg && msg.content.kind === "text") await d.data.updateMessage(d.user.id, run.artifactId, msg.id, { undoable: false, content: { ...msg.content, undone: true } });
  return { ok: true };
}
