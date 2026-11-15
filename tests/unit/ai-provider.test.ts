import { beforeEach, describe, expect, it, vi } from "vitest";

// The SDK is replaced by a recorder: these tests check what we send and how we read replies, not the network.
const calls: { params: Record<string, unknown>; options: unknown }[] = [];
let replies: (() => unknown)[] = [];
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error { status = 500; }
  class Anthropic {
    static APIError = APIError;
    beta = { messages: { stream: (params: Record<string, unknown>, options: unknown) => { calls.push({ params: structuredClone(params), options }); const next = replies.shift()!; return { on() { return this; }, finalMessage: async () => next() }; } } };
  }
  return { default: Anthropic };
});

import Anthropic from "@anthropic-ai/sdk";
import { anthropicModel } from "@/lib/ai/anthropic";
import { runSelectionEdit, startChatRun, type Deps } from "@/lib/ai/run";
import { CHAT_TOOLS, invalid } from "@/lib/ai/tools";
import type { Model } from "@/lib/ai/types";
import { DEMO, memoryData, resetMemory } from "@/lib/data/memory";
import { isBlank } from "@/lib/doc/read";
import { scopeOf } from "@/lib/doc/scope";
import { docSchema } from "@/lib/doc/schema";
import { loadYDoc, readDoc } from "@/lib/doc/ydoc";
import { localRooms } from "@/lib/rooms/local";
import { posOf, texts } from "./doc-helpers";

const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 90, cache_creation_input_tokens: 0 };
const msg = (content: unknown[], stop_reason = "end_turn") => () => ({ content, stop_reason, usage });
const signal = new AbortController().signal;
const model = () => anthropicModel({ apiKey: "test", model: "claude-opus-5-5" });

beforeEach(() => { calls.length = 0; replies = []; });

describe("the hosted model: what is sent", () => {
  it("sends the tools, effort and fallback opt-in, and nothing the current models reject", async () => {
    replies = [msg([{ type: "text", text: "hi" }])];
    const t = await model().turn({ system: "S", tools: CHAT_TOOLS, messages: [{ role: "user", content: "hello" }], signal, effort: "low" });
    const p = calls[0]!.params as Record<string, unknown>;
    expect(p.model).toBe("claude-opus-5-5");
    expect(p.output_config).toEqual({ effort: "low" });
    expect(p.fallbacks).toBe("default");
    expect(p.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect((p.tools as { eager_input_streaming: boolean }[]).every((x) => x.eager_input_streaming === true)).toBe(true);
    for (const banned of ["thinking", "tool_choice", "temperature", "top_p", "top_k"]) expect(p[banned], banned).toBeUndefined();
    expect((calls[0]!.options as { signal: AbortSignal }).signal).toBe(signal);
    expect(t).toMatchObject({ stop: "end", blocks: [{ type: "text", text: "hi" }], usage: { input: 100, output: 5 } });
  });

  it("replays its own earlier turn exactly, reasoning blocks included", async () => {
    const thinking = { type: "thinking", thinking: "", signature: "sig" };
    const call = { type: "tool_use", id: "t1", name: "read_document", input: { view: "outline" } };
    replies = [msg([thinking, call], "tool_use"), msg([{ type: "text", text: "done" }])];
    const m = model();
    const first = await m.turn({ system: "S", tools: CHAT_TOOLS, messages: [{ role: "user", content: "go" }], signal });
    expect(first).toMatchObject({ stop: "tool", blocks: [{ type: "tool_use", id: "t1" }] });
    await m.turn({ system: "S", tools: CHAT_TOOLS, signal, messages: [{ role: "user", content: "go" }, { role: "assistant", content: first.blocks, raw: first.raw }, { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "outline" }] }] });
    const sent = (calls[1]!.params.messages as { role: string; content: unknown }[]);
    expect(sent[1]).toEqual({ role: "assistant", content: [thinking, call] });
    expect(sent[2]).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "outline" }] });
  });

  it("after a mid-reply fallback, drops the reasoning and tool calls from before the switch and keeps the marker in place", async () => {
    const raw = [{ type: "thinking", thinking: "", signature: "a" }, { type: "text", text: "partial" }, { type: "tool_use", id: "old", name: "x", input: {} }, { type: "fallback", from: { model: "a" }, to: { model: "b" } }, { type: "thinking", thinking: "", signature: "b" }, { type: "text", text: "rest" }];
    replies = [msg([{ type: "text", text: "ok" }])];
    await model().turn({ system: "S", tools: [], signal, messages: [{ role: "user", content: "go" }, { role: "assistant", content: [], raw }, { role: "user", content: "more" }] });
    const echoed = (calls[0]!.params.messages as { content: { type: string }[] }[])[1]!.content.map((b) => b.type);
    expect(echoed).toEqual(["text", "fallback", "thinking", "text"]);
  });

  it("reports a refusal and a cut-off reply as such", async () => {
    replies = [msg([], "refusal"), msg([{ type: "tool_use", id: "t", name: "write_section", input: { section_id: "a" } }], "max_tokens")];
    expect((await model().turn({ system: "S", tools: [], messages: [{ role: "user", content: "x" }], signal })).stop).toBe("refused");
    expect((await model().turn({ system: "S", tools: [], messages: [{ role: "user", content: "x" }], signal })).stop).toBe("limit");
  });

  it("asks again when a tool input could not be parsed, twice at most, and never retries a real API error", async () => {
    replies = [() => { throw new SyntaxError("bad json"); }, () => { throw new SyntaxError("bad json"); }, msg([{ type: "text", text: "ok" }])];
    expect((await model().turn({ system: "S", tools: [], messages: [{ role: "user", content: "x" }], signal })).stop).toBe("end");
    expect(calls).toHaveLength(3);
    replies = [() => { throw new SyntaxError("1"); }, () => { throw new SyntaxError("2"); }, () => { throw new SyntaxError("3"); }];
    await expect(model().turn({ system: "S", tools: [], messages: [{ role: "user", content: "x" }], signal })).rejects.toThrow("3");
    replies = [() => { throw new (Anthropic as unknown as { APIError: new (m: string) => Error }).APIError("rate limited"); }, msg([])];
    await expect(model().turn({ system: "S", tools: [], messages: [{ role: "user", content: "x" }], signal })).rejects.toThrow("rate limited");
  });
});

describe("nothing runs on input that was cut short, malformed or declined", () => {
  const scripted = (turns: { blocks: unknown[]; stop: string }[]): Model => ({ name: "t", demo: true, turn: async () => ({ ...(turns.shift() ?? { blocks: [{ type: "text", text: "done" }], stop: "end" }), usage: { input: 1, output: 1 } }) as never });
  const setup = async () => { resetMemory(); const user = await memoryData.signIn(DEMO); return { user, deps: (m: Model): Deps => ({ user, data: memoryData, rooms: localRooms, model: m }) }; };
  const drain = async (s: ReadableStream<Uint8Array>) => { const r = s.getReader(); for (;;) if ((await r.read()).done) return; };
  const docOf = async (userId: string, id: string) => readDoc(loadYDoc(await localRooms.read((await memoryData.getArtifact(userId, id))!.tabs[0]!.room)), docSchema());

  it("schema check: missing, extra and wrongly typed fields are named", () => {
    const write = CHAT_TOOLS.find((t) => t.name === "write_section")!.input;
    expect(invalid(write, { section_id: "a", markdown: "x" })).toBeNull();
    expect(invalid(write, { section_id: "a" })).toBe("input.markdown is missing");
    expect(invalid(write, { section_id: "a", markdown: 5 })).toBe("input.markdown must be text");
    expect(invalid(write, { section_id: "a", markdown: "x", extra: 1 })).toBe("input.extra is not a known field");
    expect(invalid(CHAT_TOOLS.find((t) => t.name === "read_document")!.input, { view: "everything" })).toMatch(/must be one of/);
  });
  it("a tool call with a missing field is answered with INVALID_JSON and changes nothing", async () => {
    const { user, deps } = await setup();
    const a = (await memoryData.createArtifact(user.id, { kind: "doc" })).artifact;
    await memoryData.shareByEmail(user.id, a.id, "priya@draftly.test", "viewer");
    const seen: string[] = [];
    const m: Model = { name: "t", demo: true, turn: async ({ messages }) => {
      const last = messages.at(-1)!;
      if (Array.isArray(last.content) && last.content[0]?.type === "tool_result") { seen.push(last.content[0].content); return { blocks: [{ type: "text", text: "sorry" }], stop: "end", usage: { input: 1, output: 1 } }; }
      return { blocks: [{ type: "tool_use", id: "c", name: "insert_blocks", input: { position: "end" } }], stop: "tool", usage: { input: 1, output: 1 } };
    } };
    await drain(await startChatRun({ artifactId: a.id, message: "add something" }, deps(m)));
    expect(seen[0]).toContain("INVALID_JSON");
    expect(isBlank(await docOf(user.id, a.id))).toBe(true);
  });
  it("a declined request runs no tools and says so", async () => {
    const { user, deps } = await setup();
    const a = (await memoryData.listArtifacts(user.id)).find((x) => x.title === "Q1 launch plan")!;
    const before = texts(await docOf(user.id, a.id));
    await drain(await startChatRun({ artifactId: a.id, message: "x" }, deps(scripted([{ blocks: [{ type: "tool_use", id: "c", name: "set_title", input: { title: "Hacked" } }], stop: "refused" }]))));
    expect(texts(await docOf(user.id, a.id))).toEqual(before);
    expect((await memoryData.messages(user.id, a.id)).at(-1)!.content).toMatchObject({ kind: "text", text: expect.stringContaining("declined") });
  });
  it("a reply cut off mid tool call runs nothing and is reported as an error", async () => {
    const { user, deps } = await setup();
    const a = (await memoryData.listArtifacts(user.id)).find((x) => x.title === "Q1 launch plan")!;
    const before = texts(await docOf(user.id, a.id));
    await drain(await startChatRun({ artifactId: a.id, message: "x" }, deps(scripted([{ blocks: [{ type: "tool_use", id: "c", name: "set_title", input: { title: "Half" } }], stop: "limit" }]))));
    expect(texts(await docOf(user.id, a.id))).toEqual(before);
    expect((await memoryData.messages(user.id, a.id)).at(-1)!.content.kind).toBe("error");
  });
  it("a declined selection edit changes nothing", async () => {
    const { user, deps } = await setup();
    const a = (await memoryData.listArtifacts(user.id)).find((x) => x.title === "Q1 launch plan")!;
    const doc = await docOf(user.id, a.id);
    const from = posOf(doc, "firm");
    const res = await runSelectionEdit({ artifactId: a.id, scope: scopeOf(doc, from, from + 4)!, instruction: "x" }, deps(scripted([{ blocks: [{ type: "tool_use", id: "c", name: "replace_selection", input: { text: "HACKED" } }], stop: "refused" }])));
    expect(res).toMatchObject({ ok: false, message: expect.stringContaining("declined") });
    expect(texts(await docOf(user.id, a.id))).toEqual(texts(doc));
  });
});
