import type { Node } from "prosemirror-model";
import { blockHash } from "@/lib/ops/hash";
import { findById } from "@/lib/ops/targets";
import { serverSchema } from "@/lib/ops/schema";
import type { Op } from "@/lib/ops/types";

export const schema = serverSchema();
export const ctx = { me: { id: "u-me", name: "Ada" } };
const t = (text: string, marks?: unknown[]) => ({ type: "text", text, ...(marks ? { marks } : {}) });
const p = (id: string, ...c: unknown[]) => ({ type: "paragraph", attrs: { id }, content: c });
const cell = (txt: string, type = "tableCell", attrs: Record<string, unknown> = {}) => ({ type, attrs, content: [{ type: "paragraph", content: txt ? [t(txt)] : [] }] });

export const fixtureJSON = {
  type: "doc",
  content: [
    { type: "title", attrs: { id: "t" }, content: [t("Launch plan")] },
    { type: "byline", attrs: { id: "by", asof: "2026-11-12", authorId: "u-me", authorName: "Ada" } },
    { type: "heading", attrs: { id: "h1", level: 2 }, content: [t("Goals")] },
    p("p1", t("Ship the "), t("launch", [{ type: "comment", attrs: { threadId: "th1" } }]), t(" by March. "), t("Ship it ", [{ type: "bold" }]), t("well."), t(" Due "), { type: "dateChip", attrs: { value: "2026-03-04" } }),
    { type: "pending", attrs: { id: "pe1", intent: "Risks: what could slip and the fallback" } },
    { type: "bulletList", attrs: { id: "ul1" }, content: [{ type: "listItem", attrs: { id: "li1" }, content: [p("lp1", t("one"))] }, { type: "listItem", attrs: { id: "li2" }, content: [p("lp2", t("two"))] }] },
    { type: "taskList", attrs: { id: "tk1" }, content: [{ type: "taskItem", attrs: { id: "ti1", checked: false }, content: [p("tp1", t("alpha"))] }, { type: "taskItem", attrs: { id: "ti2", checked: true }, content: [p("tp2", t("beta"))] }] },
    { type: "table", attrs: { id: "tb1" }, content: [
      { type: "tableRow", attrs: { id: "r0" }, content: [cell("Risk", "tableHeader"), cell("Owner", "tableHeader")] },
      { type: "tableRow", attrs: { id: "r1" }, content: [cell("Vendor"), cell("Priya")] },
      { type: "tableRow", attrs: { id: "r2" }, content: [cell("Budget"), cell("Sam")] },
    ] },
    { type: "codeBlock", attrs: { id: "c1", language: "csv" }, content: [t("a,b\n1,2")] },
    p("p2", t("Closing words about the "), t("launch"), t(" plan.")),
  ],
};

export const fixture = (): Node => schema.nodeFromJSON(fixtureJSON);
export const hash = (doc: Node, id: string) => blockHash(findById(doc, id)!.node);
export const find = (doc: Node, id: string) => findById(doc, id)!.node;
export const text = (doc: Node, id: string) => find(doc, id).textContent;
export const md = (content: string, blocks?: Record<string, Record<string, unknown>>) => ({ as: "markdown" as const, from: { kind: "inline" as const, content }, blocks });
export const tx = (content: string) => ({ as: "text" as const, from: { kind: "inline" as const, content } });
export const blocks = (...ids: string[]) => ({ kind: "blocks" as const, ids });
export const fnd = (text: string, nth?: number) => ({ kind: "find" as const, text, ...(nth ? { nth } : {}) });
export type { Op };
