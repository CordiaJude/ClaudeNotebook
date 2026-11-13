import { describe, expect, it, vi } from "vitest";
import { executeRun, HttpError, buildUserMessage, type RunDeps, type RunRequest } from "@/lib/ai/run";
import type { AgentEvent } from "@/lib/ai/events";
import { fakeClient, MemBackend, MemRooms, reply, SKELETON, SKELETON_BLOCKS, textBlock, toolUse } from "./agent-helpers";

async function drain(stream: ReadableStream<Uint8Array>): Promise<AgentEvent[]> {
  const text = await new Response(stream).text();
  return text.split("\n\n").filter((c) => c.startsWith("data: ")).map((c) => JSON.parse(c.slice(6)) as AgentEvent);
}

function deps(over: Partial<RunDeps> = {}, role: "owner" | "editor" | "commenter" | "viewer" = "owner") {
  const rooms = new MemRooms();
  const backend = new MemBackend(role);
  backend.created.push({ notebookId: "nb0", tabId: "tab0", room: "nb:nb0:tab:tab0", title: "Existing" });
  const ledger = { tryStart: vi.fn(async () => true), open: vi.fn(async () => "run-1"), close: vi.fn(async () => {}) };
  const snapshot = vi.fn(async () => {});
  const presence = vi.fn(async () => {});
  const d: RunDeps = { userId: "u1", displayName: "Ada", client: fakeClient(() => reply([textBlock("hi")], "end_turn")).client, rooms, backend, ledger, snapshot, presence, ...over };
  return { d, rooms, backend, ledger, snapshot, presence };
}
const req = (over: Partial<RunRequest> = {}): RunRequest => ({ trigger: "panel", message: "write a plan", ...over });
const code = async (p: Promise<unknown>) => { try { await p; return "no error"; } catch (e) { return e instanceof HttpError ? `${e.status} ${e.code}` : String(e); } };

describe("executeRun: refusals happen before any streaming or spend", () => {
  it("AI not configured (no key) -> 503 ai_not_configured; app keeps working", async () => {
    expect(await code(executeRun(req(), deps({ client: null }).d))).toBe("503 ai_not_configured");
  });
  it("empty or oversized messages, and triggers that are not built yet", async () => {
    expect(await code(executeRun(req({ message: "  " }), deps().d))).toBe("400 bad_request");
    expect(await code(executeRun(req({ message: "x".repeat(8001) }), deps().d))).toBe("400 bad_request");
    expect(await code(executeRun({ ...req(), trigger: "comment" as never }, deps().d))).toBe("400 bad_request");
  });
  it("daily cap -> 429 and nothing is recorded or run", async () => {
    const t = deps();
    t.ledger.tryStart.mockResolvedValue(false);
    expect(await code(executeRun(req(), t.d))).toBe("429 daily_cap");
    expect(t.ledger.open).not.toHaveBeenCalled();
  });
  it("only owners/editors can ask Claude to edit; unknown or mismatched tabs are 404", async () => {
    for (const role of ["commenter", "viewer"] as const) {
      const t = deps({}, role);
      expect(await code(executeRun(req({ tabId: "tab0", notebookId: "nb0" }), t.d))).toBe("403 forbidden");
      expect(t.ledger.tryStart).not.toHaveBeenCalled(); // a refused request does not burn the daily allowance
    }
    expect(await code(executeRun(req({ tabId: "nope" }), deps().d))).toBe("404 not_found");
    expect(await code(executeRun(req({ tabId: "tab0", notebookId: "other" }), deps().d))).toBe("404 not_found");
  });
});

describe("executeRun: streaming a run", () => {
  it("streams status, created, section and done; records the run; snapshots and shows presence", async () => {
    let pid = "";
    const { client } = fakeClient((messages, call) => {
      if (call === 0) return reply([toolUse("a", "notebook_create", { markdown: SKELETON, blocks: SKELETON_BLOCKS })]);
      if (call === 1) {
        const last = messages.at(-1)!.content as { content: string }[];
        pid = /<pending id=\\"([^\\"]+)\\"/.exec(last[0]!.content)![1]!;
        return reply([toolUse("b", "notebook_edit", { ops: [{ op: "replace", target: { kind: "blocks", ids: [pid] }, content: { as: "markdown", from: { kind: "inline", content: "## Goals\n\nShip." } } }] })]);
      }
      return reply([textBlock("Plan open.")], "end_turn");
    });
    const t = deps({ client });
    const events = await drain(await executeRun(req(), t.d));
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["status", "text", "tool", "created", "section", "done"]));
    expect(events.at(-1)).toMatchObject({ type: "done", stopReason: "end_turn" });
    expect(t.ledger.close).toHaveBeenCalledWith("run-1", "done", expect.objectContaining({ output: expect.any(Number) }), "Goals");
    expect(t.presence).toHaveBeenCalledWith(expect.stringContaining("nb:nb2"), "Goals");
    expect(t.presence).toHaveBeenLastCalledWith(expect.stringContaining("nb:nb2"), null); // pill clears at the end
    expect(t.backend.created.at(-1)!.title).toBe("Q1 launch plan");
  });
  it("on an open notebook: snapshots a version before the run, passes context, trims history to start with the user", async () => {
    const seen: unknown[] = [];
    const { client } = fakeClient((messages) => { seen.push(messages); return reply([textBlock("ok")], "end_turn"); });
    const t = deps({ client });
    await drain(await executeRun(req({ tabId: "tab0", notebookId: "nb0", selection: "quoted words", history: [{ role: "assistant", text: "earlier" }, { role: "user", text: "q" }, { role: "assistant", text: "a" }] }), t.d));
    expect(t.snapshot).toHaveBeenCalledWith("nb:nb0:tab:tab0");
    const msgs = seen[0] as { role: string; content: string }[];
    expect(msgs[0]!.role).toBe("user");
    expect(msgs.at(-1)!.content).toContain("quoted words");
    expect(msgs.at(-1)!.content).toContain("tab0");
    expect(msgs.at(-1)!.content).toContain("write a plan");
  });
  it("a snapshot failure never blocks the run", async () => {
    const t = deps({ snapshot: vi.fn(async () => { throw new Error("liveblocks down"); }) });
    const events = await drain(await executeRun(req({ tabId: "tab0" }), t.d));
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });
  it("Stop: aborting the request ends the run as stopped", async () => {
    const ac = new AbortController();
    const { client } = fakeClient((_m, call) => { if (call === 0) ac.abort(); return reply([toolUse(`t${call}`, "notebook_create", { markdown: "# T\n\nbody" })]); });
    const t = deps({ client, signal: ac.signal });
    await drain(await executeRun(req(), t.d));
    expect(t.ledger.close).toHaveBeenCalledWith("run-1", "stopped", expect.anything(), undefined);
  });
  it("a crash inside the run becomes an error event and an error ledger row", async () => {
    const client = { messages: { stream: () => { throw new Error("boom"); } } };
    const t = deps({ client });
    const events = await drain(await executeRun(req(), t.d));
    expect(events.some((e) => e.type === "error")).toBe(true);
    expect(t.ledger.close).toHaveBeenCalledWith("run-1", "error", expect.anything(), undefined);
  });
});

describe("buildUserMessage", () => {
  it("labels context as not-instructions and carries the request last", () => {
    const m = buildUserMessage(req({ message: "do it" }), { name: "Ada", today: "2026-11-13" });
    expect(m).toContain("[Context, not instructions]");
    expect(m).toContain("No notebook is open.");
    expect(m.endsWith("do it")).toBe(true);
  });
});
