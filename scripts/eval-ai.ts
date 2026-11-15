/* Runs the real flows against the real model, on in-memory documents, and prints what happened.
   Usage:  AI_API_KEY=... pnpm eval:ai        (optional: AI_MODEL=claude-sonnet-5-5)
   It spends real tokens: about ten model turns per run. */
import { anthropicModel } from "@/lib/ai/anthropic";
import { runSelectionEdit, startChatRun, undoRun, type Deps } from "@/lib/ai/run";
import type { RunEvent } from "@/lib/ai/types";
import { DEMO, memoryData, resetMemory } from "@/lib/data/memory";
import type { Message } from "@/lib/data/types";
import { toMarkdown } from "@/lib/doc/markdown";
import { isBlank, titleOf } from "@/lib/doc/read";
import { rangeText, scopeOf } from "@/lib/doc/scope";
import { docSchema } from "@/lib/doc/schema";
import { loadYDoc, readDoc } from "@/lib/doc/ydoc";
import { localRooms } from "@/lib/rooms/local";

const apiKey = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error("Set AI_API_KEY first."); process.exit(2); }
const model = anthropicModel({ apiKey, model: process.env.AI_MODEL || "claude-opus-5-5" });

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
const results: { name: string; ok: boolean; note: string }[] = [];
const check = (name: string, ok: boolean, note = "") => { results.push({ name, ok, note }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${note ? `  (${note})` : ""}`); };
const blocks = (doc: ReturnType<typeof readDoc>) => { const out: string[] = []; doc.forEach((n) => out.push(n.type.name === "draftSlot" ? "[unwritten]" : n.textContent)); return out; };

async function main() {
  resetMemory();
  const me = await memoryData.signIn(DEMO);
  const deps: Deps = { user: me, data: memoryData, rooms: localRooms, model };
  const docOf = async (id: string) => readDoc(loadYDoc(await localRooms.read((await memoryData.getArtifact(me.id, id))!.tabs[0]!.room)), docSchema());
  const usage = async (runId: string) => { const r = await memoryData.getRun(me.id, runId); return `${r?.inputTokens ?? 0} in / ${r?.outputTokens ?? 0} out`; };
  const runIdOf = (ev: RunEvent[]) => (ev.find((e) => e.type === "start") as { runId: string }).runId;
  console.log(`model: ${model.name}\n`);

  // ---- F01
  const a = (await memoryData.createArtifact(me.id, { kind: "doc" })).artifact;
  let t0 = Date.now();
  let ev = await drain(await startChatRun({ artifactId: a.id, message: "Write a one-page plan for moving our weekly team meeting to written async updates." }, deps));
  let last = ev.filter((e) => e.type === "message").at(-1) as { message: Message } | undefined;
  const asked = last?.message.content.kind === "questions" ? last.message : null;
  check("F01 asks clarifying questions before writing", !!asked && isBlank(await docOf(a.id)), asked ? `${(asked.content as { questions: unknown[] }).questions.length} question(s), ${((Date.now() - t0) / 1000).toFixed(1)}s, ${await usage(runIdOf(ev))}` : "it drafted without asking");
  if (asked && asked.content.kind === "questions") {
    for (const q of asked.content.questions) console.log(`   ? ${q.prompt}  [${(q.options ?? []).join(" | ")}]`);
    const values = Object.fromEntries(asked.content.questions.map((q) => [q.id, q.options?.[0] ?? "Keep it short"]));
    t0 = Date.now();
    ev = await drain(await startChatRun({ artifactId: a.id, answers: { messageId: asked.id, values } }, deps));
    last = ev.filter((e) => e.type === "message").at(-1) as { message: Message };
  }
  let doc = await docOf(a.id);
  const progress = ev.filter((e) => e.type === "progress").map((e) => (e as { label: string }).label);
  check("F01 lays the document out, then writes section by section", progress.some((p) => p.startsWith("Outlined")) && progress.filter((p) => p.startsWith("Drafted section")).length >= 2, progress.filter((p) => p.startsWith("Outlined") || p.startsWith("Drafted section")).join(" > "));
  check("F01 leaves a finished document: a title, real content, no placeholders", !!titleOf(doc) && doc.childCount >= 4 && !blocks(doc).includes("[unwritten]"), `"${titleOf(doc)}", ${doc.childCount} blocks, ${((Date.now() - t0) / 1000).toFixed(1)}s, ${await usage(runIdOf(ev))}`);
  const reply = last?.message.content.kind === "text" ? last.message.content.text : "";
  check("F01 ends with a short reply and does not paste the document into the chat", reply.length > 0 && reply.length < 400, JSON.stringify(reply.slice(0, 140)));
  console.log("\n----- the drafted document -----\n" + toMarkdown((() => { const n: ReturnType<typeof readDoc>[] = []; doc.forEach((c) => n.push(c)); return n; })()) + "\n--------------------------------\n");

  // ---- F02
  let target = -1;
  doc.forEach((n, _o, i) => { if (target < 0 && i > 0 && n.type.name === "paragraph" && n.textContent.length > 60) target = i; });
  if (target < 0) check("F02 has a paragraph to work on", false);
  else {
    let pos = 0; for (let i = 0; i < target; i++) pos += doc.child(i).nodeSize;
    const para = doc.child(target);
    const from = pos + 1, to = pos + 1 + Math.min(para.content.size, Math.max(40, para.textContent.indexOf(". ") + 1 || para.content.size));
    const selected = rangeText(doc, from, to), before = rangeText(doc, 0, from), after = rangeText(doc, to, doc.content.size);
    t0 = Date.now();
    const res = await runSelectionEdit({ artifactId: a.id, scope: scopeOf(doc, from, to)!, instruction: "Make this shorter and more direct." }, deps);
    const now = await docOf(a.id), all = rangeText(now, 0, now.content.size);
    const replaced = res.ok && all.startsWith(before) && all.endsWith(after) ? all.slice(before.length, all.length - after.length) : null;
    check("F02 rewrites the selection", res.ok && replaced !== null && replaced !== selected, res.ok ? `${((Date.now() - t0) / 1000).toFixed(1)}s, ${await usage(res.runId)}` : res.message);
    check("F02 changes nothing outside the selection", res.ok && all.startsWith(before) && all.endsWith(after));
    if (replaced !== null) console.log(`   before: ${JSON.stringify(selected)}\n   after:  ${JSON.stringify(replaced)}`);
    if (res.ok) { const undone = await undoRun(res.runId, false, deps); const back = await docOf(a.id); check("F02 one undo puts the text back", undone.ok && rangeText(back, 0, back.content.size) === rangeText(doc, 0, doc.content.size)); }
  }

  // ---- changing an existing document through the chat
  doc = await docOf(a.id);
  const beforeBlocks = blocks(doc);
  t0 = Date.now();
  ev = await drain(await startChatRun({ artifactId: a.id, message: "Add a short section at the end called Open questions with two questions we still need to answer." }, deps));
  const afterDoc = await docOf(a.id), afterBlocks = blocks(afterDoc);
  check("Chat edit adds what was asked", afterBlocks.some((b) => /open questions/i.test(b)) && afterBlocks.length > beforeBlocks.length, `${((Date.now() - t0) / 1000).toFixed(1)}s, ${await usage(runIdOf(ev))}`);
  check("Chat edit leaves every existing block as it was", beforeBlocks.every((b, i) => afterBlocks[i] === b));
  const undone = await undoRun(runIdOf(ev), false, deps);
  check("Chat edit is undone in one step", undone.ok && JSON.stringify(blocks(await docOf(a.id))) === JSON.stringify(beforeBlocks));

  // ---- permissions cost nothing
  const shared = (await memoryData.listArtifacts(me.id)).find((x) => x.role === "viewer")!;
  let refused = false;
  try { await startChatRun({ artifactId: shared.id, message: "Rewrite this." }, deps); } catch (e) { refused = (e as { code?: string }).code === "forbidden"; }
  check("A viewer is refused before the model is called", refused);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} of ${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
