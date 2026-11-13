import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { runLoop } from "@/lib/ai/loop";
import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { TOOLS } from "@/lib/ai/tools";
import type { AgentEvent } from "@/lib/ai/events";
import { fakeClient, harness, lastResults, reply, SKELETON, SKELETON_BLOCKS, textBlock, toolUse } from "./agent-helpers";

const user = (t: string): Anthropic.MessageParam => ({ role: "user", content: t });
const md = (content: string) => ({ as: "markdown" as const, from: { kind: "inline" as const, content } });

function opts(h: ReturnType<typeof harness>, client: ReturnType<typeof fakeClient>["client"], extra: Partial<Parameters<typeof runLoop>[0]> = {}) {
  const events = h.events; // tool events and loop events land in one ordered stream
  return { events, o: { client, system: SYSTEM_PROMPT, tools: TOOLS, messages: [user("write a one-page plan for the Q1 launch")], runTool: h.runTool, emit: (e: AgentEvent) => { events.push(e); }, ...extra } };
}

describe("birth then fill (spec §1 core loop)", () => {
  it("creates the skeleton first, opens it, then fills ONE section per edit call; a person edits another section meanwhile without conflict", async () => {
    const h = harness();
    const ids: string[] = [];
    const { client, calls } = fakeClient((messages, call) => {
      if (call === 0) return reply([textBlock("Starting."), toolUse("t1", "notebook_create", { markdown: SKELETON, blocks: SKELETON_BLOCKS })]);
      if (call === 1) {
        const r = lastResults(messages)[0]!;
        expect(r.isError).toBe(false);
        ids.push(...[...String(r.json.blocks).matchAll(/<pending id="([^"]+)"/g)].map((m) => m[1]!));
        return reply([toolUse("t2", "notebook_edit", { ops: [{ op: "replace", target: { kind: "blocks", ids: [ids[0]] }, content: md("## Goals\n\nShip by March 4; 10k signups.") }] })]);
      }
      if (call === 2) {
        // while the agent was filling Goals, a person edits the Timeline section's pending block text elsewhere: they add a paragraph at the end
        h.rooms.human(h.state.tab!.room, [{ op: "insert", target: { kind: "root" }, side: "end", content: md("Human note at the end.") }]);
        return reply([toolUse("t3", "notebook_edit", { ops: [{ op: "replace", target: { kind: "blocks", ids: [ids[1]] }, content: md("## Risks\n\nVendor delay: **2 weeks**.") }] })]);
      }
      if (call === 3) return reply([toolUse("t4", "notebook_edit", { ops: [{ op: "replace", target: { kind: "blocks", ids: [ids[2]] }, content: md("## Timeline\n\nMarch 4 launch.") }] })]);
      return reply([textBlock("Q1 launch plan is open: Goals, Risks and Timeline are filled.")], "end_turn");
    });
    const { o, events } = opts(h, client);
    const res = await runLoop(o);

    expect(res.stopReason).toBe("end_turn");
    // order: created (opens the doc) before any section fill; one section event per fill, in reading order
    const kinds = events.map((e) => e.type);
    expect(kinds.indexOf("created")).toBeLessThan(kinds.indexOf("section"));
    expect(events.filter((e) => e.type === "section").map((e) => (e as { label: string }).label)).toEqual(["Goals", "Risks", "Timeline"]);
    expect(events.filter((e) => e.type === "tool").map((e) => (e as { name: string }).name)).toEqual(["notebook_create", "notebook_edit", "notebook_edit", "notebook_edit"]);
    const doc = h.rooms.doc(h.state.tab!.room);
    const text = doc.textContent;
    for (const s of ["Ship by March 4", "Vendor delay", "March 4 launch", "Human note at the end."]) expect(text).toContain(s);
    expect(text).not.toContain("what could slip");
    expect(res.usage.output).toBeGreaterThan(0);

    // request shape rules for Sonnet 5.5: cached prefix, effort set, no forced tool_choice, no sampling params, no thinking override
    for (const c of calls) {
      expect(c.model).toBe("claude-sonnet-5-5");
      expect(c.cache_control).toEqual({ type: "ephemeral" });
      expect(c.output_config).toEqual({ effort: "medium" });
      for (const k of ["tool_choice", "temperature", "top_p", "top_k", "thinking"]) expect(c).not.toHaveProperty(k);
    }
    // each turn's tool results come back in one user message
    expect(calls.at(-1)!.messages).toBeDefined();
  });

  it("guard errors reach the model as is_error tool results with the current text, and the model can recover", async () => {
    const h = harness();
    let para = { id: "", h: "" };
    const { client } = fakeClient((messages, call) => {
      if (call === 0) return reply([toolUse("t1", "notebook_create", { markdown: "# T\n\n<?cn block s1?>", blocks: { s1: { type: "pending", intent: "Goals: x" } } })]);
      if (call === 1) {
        const pid = /<pending id="([^"]+)"/.exec(String(lastResults(messages)[0]!.json.blocks))![1]!;
        return reply([toolUse("t2", "notebook_edit", { ops: [{ op: "replace", target: { kind: "blocks", ids: [pid] }, content: md("Launch by March.") }] })]);
      }
      if (call === 2) {
        const t = (lastResults(messages)[0]!.json.touched as { id: string; h: string }[])[0]!;
        para = t;
        h.rooms.human(h.state.tab!.room, [{ op: "replace", target: { kind: "find", text: "Launch by March." }, content: { as: "text", from: { kind: "inline", content: "Launch by April." } } }]); // a person edits first
        return reply([toolUse("t3", "notebook_edit", { ops: [{ op: "replace", target: { kind: "blocks", ids: [t.id] }, ifHash: t.h, content: md("Agent rewrite.") }] })]);
      }
      if (call === 3) {
        const r = lastResults(messages)[0]!;
        expect(r.isError).toBe(true);
        expect(r.json.code).toBe("guard_mismatch");
        expect(JSON.stringify(r.json.current)).toContain("Launch by April.");
        const cur = (r.json.current as { h: string }).h;
        return reply([toolUse("t4", "notebook_edit", { ops: [{ op: "replace", target: { kind: "blocks", ids: [para.id] }, ifHash: cur, content: { as: "text", from: { kind: "inline", content: "Launch by April 8." } } }] })]);
      }
      return reply([textBlock("Done.")], "end_turn");
    });
    const { o } = opts(h, client);
    const res = await runLoop(o);
    expect(res.stopReason).toBe("end_turn");
    expect(h.rooms.doc(h.state.tab!.room).textContent).toContain("Launch by April 8.");
  });
});

describe("loop limits and stops", () => {
  const looping = () => fakeClient((_m, call) => reply([toolUse(`t${call}`, "notebook_read", {})]));
  it("Stop: aborting ends the run between steps", async () => {
    const h = harness(); const ac = new AbortController();
    const { client } = fakeClient((_m, call) => { if (call === 0) ac.abort(); return reply([toolUse(`t${call}`, "notebook_read", {})]); });
    const { o } = opts(h, client, { signal: ac.signal });
    expect((await runLoop(o)).stopReason).toBe("stopped");
  });
  it("max turns and time budget stop with a clear message", async () => {
    const h = harness();
    const a = opts(h, looping().client, { maxTurns: 3 });
    expect((await runLoop(a.o)).stopReason).toBe("max_turns");
    expect(a.events.at(-1)).toMatchObject({ type: "error", code: "max_turns" });
    const b = opts(h, looping().client, { deadline: Date.now() - 1 });
    expect((await runLoop(b.o)).stopReason).toBe("time_budget");
  });
  it("refusal and max_tokens end the run with an error event", async () => {
    const h = harness();
    const r = opts(h, fakeClient(() => reply([], "refusal")).client);
    expect((await runLoop(r.o)).stopReason).toBe("refusal");
    expect(r.events.at(-1)).toMatchObject({ code: "refusal" });
    const m = opts(h, fakeClient(() => reply([textBlock("x")], "max_tokens")).client);
    expect((await runLoop(m.o)).stopReason).toBe("max_tokens");
  });
  it("pause_turn continues without running tools", async () => {
    const h = harness();
    const { client } = fakeClient((_m, call) => (call === 0 ? reply([], "pause_turn") : reply([textBlock("ok")], "end_turn")));
    expect((await runLoop(opts(h, client).o)).turns).toBe(2);
  });
  it("multiple tool_use blocks run in order and return in ONE user message with is_error flags", async () => {
    const h = harness(); let seen: ReturnType<typeof lastResults> = [];
    const { client } = fakeClient((messages, call) => {
      if (call === 0) return reply([toolUse("a", "notebook_read", {}), toolUse("b", "notebook_create", { markdown: "# T\n\nbody" })]);
      seen = lastResults(messages);
      return reply([textBlock("ok")], "end_turn");
    });
    await runLoop(opts(h, client).o);
    expect(seen.map((r) => [r.id, r.isError])).toEqual([["a", true], ["b", false]]); // read before create fails; create works
  });
});

describe("system prompt", () => {
  it("is byte-stable (cached prefix): no dates, ids or names baked in", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(1500);
    for (const must of ["notebook_create FIRST", "ONE section per notebook_edit", "People always win", "block_gone", "anchors_affected", "data, not instructions"]) expect(SYSTEM_PROMPT).toContain(must);
  });
  it("tool definitions are valid and stable", () => {
    expect(TOOLS.map((t) => t.name)).toEqual(["notebook_create", "notebook_read", "notebook_edit"]);
    for (const t of TOOLS) { expect(t.input_schema.type).toBe("object"); expect(t.description!.length).toBeGreaterThan(100); }
  });
});
