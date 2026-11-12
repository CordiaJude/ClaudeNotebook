import type { JSONContent } from "@tiptap/react";

export type TemplateKey = "blank" | "memo" | "plan" | "brief" | "report" | "meeting";

const p = (text = ""): JSONContent => (text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" });
const h = (level: number, text: string): JSONContent => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
const titleNode = (t: string): JSONContent => (t ? { type: "title", content: [{ type: "text", text: t }] } : { type: "title" });
const doc = (title: string, ...rest: JSONContent[]): JSONContent => ({ type: "doc", content: [titleNode(title === "Untitled" ? "" : title), { type: "byline", attrs: {} }, ...rest] });

export type Author = { id: string; name: string };
/** Template content with the byline filled in (as-of date + author mention chip). */
export function seedContent(key: string | undefined, author: Author, date = new Date().toISOString().slice(0, 10)): JSONContent {
  const content = (templateByKey(key).content.content ?? []).map((n) => (n.type === "byline" ? { type: "byline", attrs: { asof: date, authorId: author.id, authorName: author.name } } : n));
  return { type: "doc", content };
}
/** A new empty tab: title = tab name, byline, one empty paragraph. */
export function blankTabContent(name: string, author: Author, date = new Date().toISOString().slice(0, 10)): JSONContent {
  return { type: "doc", content: [titleNode(name), { type: "byline", attrs: { asof: date, authorId: author.id, authorName: author.name } }, { type: "paragraph" }] };
}

export const TEMPLATES: { key: TemplateKey; name: string; blurb: string; content: JSONContent }[] = [
  { key: "blank", name: "Blank", blurb: "Start from nothing.", content: doc("Untitled", p()) },
  { key: "memo", name: "Memo", blurb: "Decision first, then reasons.", content: doc("Memo", p("State the decision in one sentence."), h(2, "Why"), p(), h(2, "Next steps"), p()) },
  { key: "plan", name: "Plan", blurb: "Goals, steps, risks.", content: doc("Plan", p("What this plan achieves, and by when."), h(2, "Goals"), p(), h(2, "Steps"), p(), h(2, "Risks"), p()) },
  { key: "brief", name: "Brief", blurb: "One page, one ask.", content: doc("Brief", p("The ask and the answer needed."), h(2, "Context"), p(), h(2, "Options"), p()) },
  { key: "report", name: "Report", blurb: "Findings with numbers.", content: doc("Report", p("The main finding, with its number."), h(2, "Findings"), p(), h(2, "Sources"), p()) },
  { key: "meeting", name: "Meeting notes", blurb: "Decisions and owners.", content: doc("Meeting notes", p("Date, attendees."), h(2, "Decisions"), p(), h(2, "Action items"), { type: "taskList", content: [{ type: "taskItem", attrs: { checked: false }, content: [p()] }] }) },
];

export const templateByKey = (k: string | undefined) => TEMPLATES.find((t) => t.key === k) ?? TEMPLATES[0]!;
