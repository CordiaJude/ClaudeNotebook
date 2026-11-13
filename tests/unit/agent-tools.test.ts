import { describe, expect, it } from "vitest";
import { blockHash } from "@/lib/ops/hash";
import { findById } from "@/lib/ops/targets";
import { harness, SKELETON, SKELETON_BLOCKS } from "./agent-helpers";

const parse = (o: { content: string }) => JSON.parse(o.content);
async function born(role: "owner" | "editor" | "commenter" | "viewer" = "owner") {
  const h = harness(role);
  const out = await h.runTool("notebook_create", { markdown: SKELETON, blocks: SKELETON_BLOCKS });
  expect(out.isError).toBe(false);
  const j = parse(out);
  h.state.tab = { ...h.state.tab!, role }; // the route resolves the real role from the database
  return { ...h, tab: j.tabId as string, room: h.state.tab!.room, outline: j.blocks as string };
}
const idOf = (outline: string, tag: string, nth = 0) => [...outline.matchAll(new RegExp(`<${tag} id="([^"]+)" h="([0-9a-f]{8})"`, "g"))][nth]!.slice(1);

describe("notebook_create (birth)", () => {
  it("makes a notebook, opens it immediately (created event), and writes title + byline + one pending block per section", async () => {
    const t = await born();
    expect(t.events[0]).toMatchObject({ type: "created", notebookId: "nb1", tabId: "tab1" });
    const doc = t.rooms.doc(t.room);
    expect(doc.child(0).textContent).toBe("Q1 launch plan");
    expect(doc.child(1).attrs).toMatchObject({ asof: "2026-11-12", authorId: "u-me", authorName: "Ada" });
    expect([...Array(doc.childCount).keys()].slice(2).map((i) => doc.child(i).type.name)).toEqual(["pending", "pending", "pending"]);
    expect(t.backend.created[0]!.title).toBe("Q1 launch plan");
    expect(t.outline).toContain("<pending");
    expect(t.outline).toContain("Goals: the three outcomes");
  });
  it("title falls back to the title argument; default byline is today + the requester", async () => {
    const h = harness();
    await h.runTool("notebook_create", { title: "Memo", markdown: "Decision: ship.\n\n<?cn block s1?>", blocks: { s1: { type: "pending", intent: "Why: reasons" } } });
    const doc = h.rooms.doc(h.state.tab!.room);
    expect(doc.child(0).textContent).toBe("Memo");
    expect(doc.child(1).attrs.authorName).toBe("Ada");
    expect(doc.child(1).attrs.asof).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("rejects bad skeletons with a fix, creating nothing", async () => {
    const h = harness();
    for (const input of [{ markdown: "  " }, { markdown: "no title here" }, { markdown: "# T\n\n<?cn block x?>" }, { markdown: "# T\n\n" + "x".repeat(31_000) }]) {
      const o = await h.runTool("notebook_create", input);
      expect(o.isError).toBe(true);
      expect(parse(o).fix.length).toBeGreaterThan(5);
    }
    expect(h.backend.created).toHaveLength(0);
  });
});

describe("notebook_read", () => {
  it("outline lists ids + hashes; view shows table rows and cells with their own hashes; search; unknown modes", async () => {
    const t = await born();
    const fill = await t.runTool("notebook_edit", { ops: [{ op: "replace", target: { kind: "blocks", ids: [idOf(t.outline, "pending")[0]] }, content: { as: "markdown", from: { kind: "inline", content: "| Goal | Owner |\n|---|---|\n| Launch | Priya |\n\n- one\n- two\n\n```latex\nE=mc^2\n```" } } }] });
    expect(fill.isError).toBe(false);
    const o = parse(await t.runTool("notebook_read", {}));
    expect(o.blocks).toMatch(/<table id="[^"]+" h="[0-9a-f]{8}" rows="2" cols="2">/);
    expect(o.blocks).toMatch(/<ul id=.* items="2"/);
    expect(o.blocks).toMatch(/<code id=.* lang="latex">/);
    const tableId = idOf(o.blocks, "table")[0];
    const v = parse(await t.runTool("notebook_read", { mode: "view", parentId: tableId })).view as string;
    expect(v).toMatch(/\[c0 h=[0-9a-f]{8} th\] Goal \| \[c1 h=[0-9a-f]{8} th\] Owner/);
    expect(v).toMatch(/<row id="[^"]+" h="[0-9a-f]{8}" r="1">/);
    expect(parse(await t.runTool("notebook_read", { mode: "search", text: "priya" })).hits.length).toBe(1);
    expect((await t.runTool("notebook_read", { mode: "view" })).isError).toBe(true);
    expect((await t.runTool("notebook_read", { mode: "search" })).isError).toBe(true);
    expect((await t.runTool("notebook_read", { mode: "view", parentId: "nope" })).content).toContain("block_gone");
    expect((await t.runTool("notebook_read", { mode: "banana" })).isError).toBe(true);
  });
  it("changes reports blocks a person edited, added or removed since the last read", async () => {
    const t = await born();
    await t.runTool("notebook_read", {});
    const [p2] = idOf(t.outline, "pending", 1) as [string];
    const [p3] = idOf(t.outline, "pending", 2) as [string];
    t.rooms.human(t.room, [{ op: "replace", target: { kind: "find", text: "Q1 launch plan" }, content: { as: "text", from: { kind: "inline", content: "Q2 launch plan" } } }, { op: "delete", target: { kind: "blocks", ids: [p2] } }, { op: "insert", target: { kind: "blocks", ids: [p3] }, side: "after", content: { as: "markdown", from: { kind: "inline", content: "A human paragraph." } } }]);
    const c = parse(await t.runTool("notebook_read", { mode: "changes" }));
    expect(c.removed).toEqual([p2]);
    expect(c.added).toHaveLength(1);
    expect(c.changed).toHaveLength(1);
    const again = parse(await t.runTool("notebook_read", { mode: "changes" }));
    expect(again.changed.length + again.added.length + again.removed.length).toBe(0);
  });
  it("no notebook open -> bad_request telling the agent to create one", async () => {
    const o = await harness().runTool("notebook_read", {});
    expect(o.isError).toBe(true);
    expect(parse(o).fix).toMatch(/notebook_create/);
  });
});

describe("notebook_edit", () => {
  it("fills a pending block; emits a section label from its intent; returns touched hashes for chaining", async () => {
    const t = await born();
    const [id] = idOf(t.outline, "pending", 1);
    const o = parse(await t.runTool("notebook_edit", { ops: [{ op: "replace", target: { kind: "blocks", ids: [id] }, content: { as: "markdown", from: { kind: "inline", content: "## Risks\n\nVendor delay is the top risk." } } }] }));
    expect(o.removed).toEqual([id]);
    expect(t.events.find((e) => e.type === "section")).toMatchObject({ label: "Risks" });
    const touched = o.touched as { id: string; h: string }[];
    const doc = t.rooms.doc(t.room);
    expect(touched.every((x) => blockHash(findById(doc, x.id)!.node) === x.h)).toBe(true); // chain without re-reading
  });
  it("human edits elsewhere survive; a stale guard is refused with the current text and nothing is overwritten", async () => {
    const t = await born();
    const [g] = idOf(t.outline, "pending", 0);
    // fill goals, then a person rewrites the first paragraph while the agent holds its old hash
    const filled = parse(await t.runTool("notebook_edit", { ops: [{ op: "replace", target: { kind: "blocks", ids: [g] }, content: { as: "markdown", from: { kind: "inline", content: "Launch by March." } } }] }));
    const para = filled.touched[0] as { id: string; h: string };
    t.rooms.human(t.room, [{ op: "replace", target: { kind: "find", text: "Launch by March." }, content: { as: "text", from: { kind: "inline", content: "Launch by April." } } }]);
    const stale = await t.runTool("notebook_edit", { ops: [{ op: "replace", target: { kind: "blocks", ids: [para.id] }, ifHash: para.h, content: { as: "markdown", from: { kind: "inline", content: "Agent version." } } }] });
    expect(stale.isError).toBe(true);
    const j = parse(stale);
    expect(j.code).toBe("guard_mismatch");
    expect(JSON.stringify(j.current)).toContain("Launch by April.");
    expect(t.rooms.doc(t.room).textContent).toContain("Launch by April.");
    // the agent re-reads and retries with the new hash
    const view = parse(await t.runTool("notebook_read", { mode: "view", parentId: para.id })).view as string;
    const fresh = view.match(/ h="([0-9a-f]{8})"/)![1]!;
    const retry = await t.runTool("notebook_edit", { ops: [{ op: "replace", target: { kind: "blocks", ids: [para.id] }, ifHash: fresh, content: { as: "text", from: { kind: "inline", content: "Launch by April 8." } } }] });
    expect(retry.isError).toBe(false);
  });
  it("a pending block a person deleted comes back block_gone (drop that section)", async () => {
    const t = await born();
    const [id] = idOf(t.outline, "pending", 1) as [string];
    t.rooms.human(t.room, [{ op: "delete", target: { kind: "blocks", ids: [id] } }]);
    const o = await t.runTool("notebook_edit", { ops: [{ op: "replace", target: { kind: "blocks", ids: [id] }, content: { as: "markdown", from: { kind: "inline", content: "x" } } }] });
    expect(parse(o)).toMatchObject({ ok: false, code: "block_gone" });
    expect(parse(o).fix).toMatch(/drop that section/i);
  });
  it("commenters and viewers cannot edit; suggest mode is not available yet; atomic failure writes nothing", async () => {
    for (const role of ["commenter", "viewer"] as const) {
      const t = await born(role);
      const o = await t.runTool("notebook_edit", { ops: [{ op: "insert", target: { kind: "root" }, side: "end", content: { as: "markdown", from: { kind: "inline", content: "x" } } }] });
      expect(parse(o).code).toBe("forbidden");
    }
    const t = await born();
    expect(parse(await t.runTool("notebook_edit", { mode: "suggest", ops: [] })).code).toBe("bad_request");
    const before = JSON.stringify(t.rooms.doc(t.room).toJSON());
    await t.runTool("notebook_edit", { ops: [{ op: "insert", target: { kind: "root" }, side: "end", content: { as: "markdown", from: { kind: "inline", content: "ok" } } }, { op: "replace", target: { kind: "find", text: "zzz" }, content: { as: "text", from: { kind: "inline", content: "y" } } }] });
    expect(JSON.stringify(t.rooms.doc(t.room).toJSON())).toBe(before);
  });
  it("unknown tool and thrown errors become tool errors, never crashes", async () => {
    const t = await born();
    expect(parse(await t.runTool("nope", {})).fix).toMatch(/Unknown tool/);
    expect((await t.runTool("notebook_edit", { ops: [{ op: "replace", target: { kind: "cell", table: "x", row: 0, col: 0 }, ifHash: "a", content: { as: "text", from: { kind: "inline", content: "z" } } }] })).isError).toBe(true);
  });
});
