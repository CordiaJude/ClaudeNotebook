import { describe, expect, it } from "vitest";
import { markdownToJson, blocksFromMarkdown } from "@/lib/ops/markdown";
import { serverSchema } from "@/lib/ops/schema";

const ctx = { me: { id: "u1", name: "Ada" } };

describe("markdown -> blocks", () => {
  it("parses headings, lists, tasks, tables, code", () => {
    const { blocks } = markdownToJson("## H\n\n- a\n- b\n\n- [ ] t\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\n```latex\nE=mc^2\n```", {}, ctx);
    expect(blocks.map((b) => b.type)).toEqual(["heading", "bulletList", "taskList", "table", "codeBlock"]);
    expect(blocks[4]!.attrs?.language).toBe("latex");
  });
  it("turns a block token alone on its line into a pending block", () => {
    const { blocks, chipCount } = markdownToJson("Intro\n\n<?cn block s1?>", { s1: { type: "pending", intent: "Risks: what could slip" } }, ctx);
    expect(blocks[1]).toEqual({ type: "pending", attrs: { intent: "Risks: what could slip" } });
    expect(chipCount).toBe(1);
  });
  it("turns inline tokens into chips inside a sentence", () => {
    const { blocks } = markdownToJson("Due <?cn block d?> by <?cn block me?>.", { d: { type: "date", value: "2026-12-01" }, me: { type: "mention", user: "me" } }, ctx);
    const kinds = blocks[0]!.content!.map((c) => c.type);
    expect(kinds).toEqual(["text", "dateChip", "text", "mentionChip", "text"]);
    expect(blocks[0]!.content![3]!.attrs).toMatchObject({ kind: "user", ref: "u1", label: "Ada" });
  });
  it("rejects unknown keys, bad chip defs, and block chips inside a sentence", () => {
    expect(() => markdownToJson("<?cn block nope?>", {}, ctx)).toThrow(/no entry/);
    expect(() => markdownToJson("<?cn block x?>", { x: { type: "date", value: "tomorrow" } }, ctx)).toThrow(/not a valid chip/);
    expect(() => markdownToJson("see <?cn block p?> here", { p: { type: "pending", intent: "x" } }, ctx)).toThrow(/block-level/);
  });
  it("produces schema-valid nodes with ids; empty markdown is refused", () => {
    const s = serverSchema();
    const { nodes } = blocksFromMarkdown(s, "# Not a title\n\ntext", undefined, ctx);
    expect(nodes.every((n) => typeof n.attrs.id === "string" && n.attrs.id.length > 4)).toBe(true);
    expect(() => blocksFromMarkdown(s, "   ", undefined, ctx)).toThrow(/no blocks/);
  });
});
