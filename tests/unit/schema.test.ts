import { describe, expect, it } from "vitest";
import { serverSchema } from "@/lib/ops/schema";

describe("server schema", () => {
  it("builds headlessly with the app's node and mark types", () => {
    const s = serverSchema();
    for (const n of ["doc", "title", "byline", "paragraph", "heading", "table", "tableRow", "tableCell", "pending", "embed", "mentionChip", "dateChip", "dropdownChip", "codeBlock", "taskItem"]) expect(s.nodes[n], n).toBeDefined();
    for (const m of ["bold", "italic", "link", "comment"]) expect(s.marks[m], m).toBeDefined();
  });
  it("enforces title + byline + body", () => {
    const s = serverSchema();
    const ok = s.nodeFromJSON({ type: "doc", content: [{ type: "title" }, { type: "byline", attrs: {} }, { type: "paragraph" }] });
    expect(() => ok.check()).not.toThrow();
    const bad = s.nodeFromJSON({ type: "doc", content: [{ type: "paragraph" }] });
    expect(() => bad.check()).toThrow();
  });
});
