/**
 * Agent evals (spec §13): scripted prompts against the REAL model, asserting on document structure, not wording.
 * Costs real money (a handful of short runs). Run:  ANTHROPIC_API_KEY=... pnpm eval:agent
 * It uses in-memory storage; nothing touches Supabase or Liveblocks.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Node } from "prosemirror-model";
import { harness, MemRooms } from "../tests/unit/agent-helpers";
import { runLoop, type AnthropicLike } from "@/lib/ai/loop";
import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { TOOLS } from "@/lib/ai/tools";
import { buildUserMessage } from "@/lib/ai/run";
import { birthUpdate } from "@/lib/ops/ydoc";
import { serverSchema } from "@/lib/ops/schema";
import type { AgentEvent } from "@/lib/ai/events";
import type { TabInfo } from "@/lib/ai/exec";

if (!process.env.ANTHROPIC_API_KEY) { console.error("Set ANTHROPIC_API_KEY to run the evals."); process.exit(2); }
const client = new Anthropic() as unknown as AnthropicLike;
const schema = serverSchema();

type Result = { name: string; pass: boolean; notes: string[]; tools: string[]; tokens: number };
const results: Result[] = [];

const types = (doc: Node) => { const t: string[] = []; doc.descendants((n) => { t.push(n.type.name); }); return t; };
const commentChars = (doc: Node) => { let n = 0; doc.descendants((x) => { if (x.isText && x.marks.some((m) => m.type.name === "comment")) n += x.text!.length; }); return n; };

async function scenario(name: string, opts: {
  prompt: string; seed?: object; role?: TabInfo["role"];
  beforeEdit?: (h: ReturnType<typeof harness>) => void; check: (doc: Node, h: ReturnType<typeof harness>, tools: string[]) => string[];
}) {
  const h = harness();
  const tools: string[] = [];
  if (opts.seed) {
    const room = "nb:seed:tab:seed";
    const doc = schema.nodeFromJSON(opts.seed);
    await h.rooms.ensure(room);
    await h.rooms.save(room, birthUpdate(doc).update);
    h.backend.created.push({ notebookId: "seed", tabId: "seed", room, title: "Seed" });
    h.state.tab = { notebookId: "seed", tabId: "seed", room, role: "editor", name: "Main" };
  }
  let editedOnce = false;
  const run = async (n: string, i: unknown) => {
    tools.push(n);
    if (n === "notebook_edit" && !editedOnce) { editedOnce = true; opts.beforeEdit?.(h); }
    return h.runTool(n, i);
  };
  const events: AgentEvent[] = [];
  const msg = buildUserMessage({ trigger: "panel", message: opts.prompt }, { name: "Ada", today: new Date().toISOString().slice(0, 10), tab: h.state.tab && { ...h.state.tab } });
  const r = await runLoop({ client, system: SYSTEM_PROMPT, tools: TOOLS, messages: [{ role: "user", content: msg }], runTool: run, emit: (e) => events.push(e), deadline: Date.now() + 240_000 });
  const doc = h.state.tab ? h.rooms.doc(h.state.tab.room) : null;
  const notes = doc ? opts.check(doc, h, tools) : ["no document was created"];
  const err = events.find((e) => e.type === "error");
  if (err && err.type === "error") notes.push(`run error: ${err.code}`);
  results.push({ name, pass: notes.length === 0, notes, tools, tokens: r.usage.input + r.usage.output });
  console.log(`${notes.length === 0 ? "PASS" : "FAIL"}  ${name}  (${tools.length} tool calls, ${r.usage.output} output tokens)${notes.length ? "\n      - " + notes.join("\n      - ") : ""}`);
}

const p = (id: string, text: string) => ({ type: "paragraph", attrs: { id }, content: [{ type: "text", text }] });
const base = (...body: object[]) => ({ type: "doc", content: [{ type: "title", attrs: { id: "t" }, content: [{ type: "text", text: "Launch plan" }] }, { type: "byline", attrs: { id: "by", asof: "2026-11-12", authorId: "u-me", authorName: "Ada" } }, ...body] });

await scenario("memo: skeleton first, one section per edit, nothing left pending", {
  prompt: "Write a one-page memo recommending that a 12-person team move from monthly to weekly releases.",
  check: (doc, _h, tools) => {
    const n: string[] = [];
    if (tools[0] !== "notebook_create") n.push(`first tool was ${tools[0]}, expected notebook_create`);
    if (types(doc).includes("pending")) n.push("pending blocks were left unfilled");
    if (doc.childCount < 4) n.push("document is almost empty");
    if (tools.filter((t) => t === "notebook_edit").length < 2) n.push("fewer than 2 separate edit calls (should fill one section per call)");
    if (/^this (document|memo) (outlines|describes)/i.test(doc.child(2)?.textContent ?? "")) n.push("lead sentence is throat-clearing");
    if (doc.child(1).type.name !== "byline") n.push("byline missing");
    return n;
  },
});
await scenario("comparison table", {
  prompt: "Compare Postgres, MySQL and SQLite for a small SaaS product. Keep it short.",
  check: (doc) => (types(doc).includes("table") ? [] : ["expected a table for a comparison"]),
});
await scenario("edit in place: change one word, touch nothing else", {
  seed: base(p("p1", "We launch on March 4 with two open risks."), p("p2", "Budget is approved.")),
  prompt: "Change the launch month from March to April.",
  check: (doc) => {
    const n: string[] = [];
    if (!doc.textContent.includes("April 4")) n.push("did not change March to April");
    if (!doc.textContent.includes("Budget is approved.")) n.push("changed text it was not asked to change");
    return n;
  },
});
await scenario("human wins: a person edits the paragraph just before the agent's edit lands", {
  seed: base(p("p1", "The plan has three phases and a long, rambling description that could be tightened."), p("p2", "Closing line.")),
  prompt: "Tighten the first paragraph.",
  beforeEdit: (h) => h.rooms.human(h.state.tab!.room, [{ op: "insert", target: { kind: "find", text: "three phases" }, side: "after", content: { as: "text", from: { kind: "inline", content: " (HUMAN-EDIT)" } } }]),
  check: (doc) => (doc.textContent.includes("HUMAN-EDIT") ? [] : ["the person's edit was overwritten"]),
});
await scenario("comment anchors are not silently destroyed", {
  seed: base({ type: "paragraph", attrs: { id: "p1" }, content: [{ type: "text", text: "Ship the " }, { type: "text", text: "launch", marks: [{ type: "comment", attrs: { threadId: "th1" } }] }, { type: "text", text: " by March." }] }),
  prompt: "Replace the word launch with release.",
  check: (doc) => (commentChars(doc) > 0 ? [] : ["the commented words were rewritten without allowDetach, losing the thread"]),
});
await scenario("a pending block deleted by a person is not recreated", {
  seed: base({ type: "heading", attrs: { id: "h1", level: 2 }, content: [{ type: "text", text: "Goals" }] }, p("p1", "Ship by March."), { type: "pending", attrs: { id: "pe1", intent: "Risks: what could slip" } }),
  prompt: "Fill in the Risks section.",
  beforeEdit: (h) => h.rooms.human(h.state.tab!.room, [{ op: "delete", target: { kind: "blocks", ids: ["pe1"] } }]),
  check: (doc) => {
    const headings: string[] = [];
    doc.forEach((n) => { if (n.type.name === "heading") headings.push(n.textContent); });
    const n: string[] = [];
    if (types(doc).includes("pending")) n.push("recreated a pending block a person had deleted");
    if (headings.some((h) => /risk/i.test(h))) n.push("re-created the Risks section the person deleted");
    return n;
  },
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed · ${results.reduce((a, r) => a + r.tokens, 0)} tokens total`);
void MemRooms;
process.exit(failed.length ? 1 : 0);
