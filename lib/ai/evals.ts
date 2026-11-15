/* Live checks of the real flows against a real model, on in-memory documents. Used by `pnpm eval:ai` and by the
   preview-only /api/eval route. Each scenario starts from fresh demo data, so it can run alone in one request. */
import { runSelectionEdit, startChatRun, undoRun, type Deps } from "./run";
import type { Model, RunEvent } from "./types";
import { DEMO, memoryData, resetMemory } from "@/lib/data/memory";
import type { Message } from "@/lib/data/types";
import { toMarkdown } from "@/lib/doc/markdown";
import { isBlank, titleOf } from "@/lib/doc/read";
import { rangeText, scopeOf } from "@/lib/doc/scope";
import { docSchema } from "@/lib/doc/schema";
import { loadYDoc, readDoc } from "@/lib/doc/ydoc";
import { localRooms } from "@/lib/rooms/local";
import type { Node } from "prosemirror-model";

/** SHA-256 of the token the preview eval route accepts. The token itself is not in the repository. */
export const EVAL_TOKEN_SHA256 = "ceabd779dcb5ff0f0506c61ffd6fad48d325ce8595b258d0f8938f0e341f4bab";
export const SCENARIOS = ["draft", "selection", "edit"] as const;
export type Scenario = (typeof SCENARIOS)[number];
export type Check = { name: string; ok: boolean; note: string };
export type EvalReport = { model: string; scenario: Scenario; seconds: number; inputTokens: number; outputTokens: number; checks: Check[]; document?: string; error?: string };

async function drain(stream: ReadableStream<Uint8Array>): Promise<RunEvent[]> {
  const out: RunEvent[] = [], dec = new TextDecoder(), reader = stream.getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    for (let i = buf.indexOf("\n\n"); i >= 0; i = buf.indexOf("\n\n")) { const line = buf.slice(0, i); buf = buf.slice(i + 2); if (line.startsWith("data: ")) out.push(JSON.parse(line.slice(6))); }
  }
  return out;
}
const blocks = (doc: Node) => { const out: string[] = []; doc.forEach((n) => out.push(n.type.name === "draftSlot" ? "[unwritten]" : n.textContent)); return out; };
const asMarkdown = (doc: Node) => { const n: Node[] = []; doc.forEach((c) => n.push(c)); return toMarkdown(n); };

export async function runScenario(model: Model, scenario: Scenario): Promise<EvalReport> {
  resetMemory();
  const me = await memoryData.signIn(DEMO);
  const deps: Deps = { user: me, data: memoryData, rooms: localRooms, model };
  const checks: Check[] = [];
  const check = (name: string, ok: boolean, note = "") => checks.push({ name, ok, note });
  const spent = { input: 0, output: 0 };
  const docOf = async (id: string) => readDoc(loadYDoc(await localRooms.read((await memoryData.getArtifact(me.id, id))!.tabs[0]!.room)), docSchema());
  const count = async (runId: string) => { const r = await memoryData.getRun(me.id, runId); spent.input += r?.inputTokens ?? 0; spent.output += r?.outputTokens ?? 0; };
  const runIdOf = (ev: RunEvent[]) => (ev.find((e) => e.type === "start") as { runId: string }).runId;
  const errorsIn = (ev: RunEvent[]) => ev.filter((e) => e.type === "error").map((e) => (e as { message: string }).message).join("; ");
  const t0 = Date.now();
  let document: string | undefined, error: string | undefined;
  try {
    if (scenario === "draft") {
      const a = (await memoryData.createArtifact(me.id, { kind: "doc" })).artifact;
      let ev = await drain(await startChatRun({ artifactId: a.id, message: "Write a one-page plan for moving our weekly team meeting to written async updates." }, deps));
      await count(runIdOf(ev));
      let last = ev.filter((e) => e.type === "message").at(-1) as { message: Message } | undefined;
      const asked = last?.message.content.kind === "questions" ? last.message : null;
      check("asks clarifying questions before writing anything", !!asked && isBlank(await docOf(a.id)), asked && asked.content.kind === "questions" ? asked.content.questions.map((q) => `${q.prompt} [${(q.options ?? []).join(" | ")}]`).join("  /  ") : `it did not ask. ${errorsIn(ev)}`);
      if (asked && asked.content.kind === "questions") {
        const values = Object.fromEntries(asked.content.questions.map((q) => [q.id, q.options?.[0] ?? "Keep it short"]));
        ev = await drain(await startChatRun({ artifactId: a.id, answers: { messageId: asked.id, values } }, deps));
        await count(runIdOf(ev));
        last = ev.filter((e) => e.type === "message").at(-1) as { message: Message };
      }
      const doc = await docOf(a.id);
      const progress = ev.filter((e) => e.type === "progress").map((e) => (e as { label: string }).label);
      check("lays the document out, then writes section by section", progress.some((p) => p.startsWith("Outlined")) && progress.filter((p) => p.startsWith("Drafted section")).length >= 2, progress.filter((p) => p.startsWith("Outlined") || p.startsWith("Drafted section")).join(" > ") || errorsIn(ev));
      check("leaves a finished document: a title, real content, no placeholders", !!titleOf(doc) && doc.childCount >= 4 && !blocks(doc).includes("[unwritten]"), `"${titleOf(doc)}", ${doc.childCount} blocks`);
      const reply = last?.message.content.kind === "text" ? last.message.content.text : "";
      check("ends with a short reply and does not paste the document into the chat", reply.length > 0 && reply.length < 400, reply.slice(0, 160));
      document = asMarkdown(doc);
    } else if (scenario === "selection") {
      const a = (await memoryData.listArtifacts(me.id)).find((x) => x.title === "Q1 launch plan")!;
      const doc = await docOf(a.id);
      const needle = "because the supplier is two weeks late";
      let from = -1;
      doc.descendants((n, pos) => { if (from < 0 && n.isText && n.text!.includes(needle)) from = pos + n.text!.indexOf(needle); return from < 0; });
      const to = from + needle.length;
      const before = rangeText(doc, 0, from), after = rangeText(doc, to, doc.content.size);
      const res = await runSelectionEdit({ artifactId: a.id, scope: scopeOf(doc, from, to)!, instruction: "Say this in fewer words." }, deps);
      if (res.ok) await count(res.runId);
      const now = await docOf(a.id), all = rangeText(now, 0, now.content.size);
      const kept = all.startsWith(before) && all.endsWith(after);
      const replaced = kept ? all.slice(before.length, all.length - after.length) : null;
      check("rewrites the selection", res.ok && replaced !== null && replaced !== needle, res.ok ? `"${needle}" -> "${replaced}"` : res.message);
      check("changes nothing outside the selection", res.ok && kept);
      if (res.ok) { const undone = await undoRun(res.runId, false, deps); const back = await docOf(a.id); check("one undo puts the text back", undone.ok && rangeText(back, 0, back.content.size) === rangeText(doc, 0, doc.content.size)); }
      document = asMarkdown(now);
    } else {
      const a = (await memoryData.listArtifacts(me.id)).find((x) => x.title === "Q1 launch plan")!;
      const beforeBlocks = blocks(await docOf(a.id));
      const ev = await drain(await startChatRun({ artifactId: a.id, message: "Add a short section at the end called Open questions with two questions we still need to answer." }, deps));
      await count(runIdOf(ev));
      const afterDoc = await docOf(a.id), afterBlocks = blocks(afterDoc);
      check("adds what was asked", afterBlocks.some((b) => /open questions/i.test(b)) && afterBlocks.length > beforeBlocks.length, afterBlocks.slice(beforeBlocks.length).join(" | ").slice(0, 300) || errorsIn(ev));
      check("leaves every existing block as it was", beforeBlocks.every((b, i) => afterBlocks[i] === b));
      document = asMarkdown(afterDoc);
      const undone = await undoRun(runIdOf(ev), false, deps).catch((e: Error) => ({ ok: false as const, message: e.message }));
      check("is undone in one step", undone.ok && JSON.stringify(blocks(await docOf(a.id))) === JSON.stringify(beforeBlocks));
      const shared = (await memoryData.listArtifacts(me.id)).find((x) => x.role === "viewer")!;
      let refused = false;
      try { await startChatRun({ artifactId: shared.id, message: "Rewrite this." }, deps); } catch (e) { refused = (e as { code?: string }).code === "forbidden"; }
      check("a viewer is refused before the model is called", refused);
    }
  } catch (e) { error = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 500) : "error"; }
  return { model: model.name, scenario, seconds: Math.round((Date.now() - t0) / 100) / 10, inputTokens: spent.input, outputTokens: spent.output, checks, ...(document ? { document } : {}), ...(error ? { error } : {}) };
}
