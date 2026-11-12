import type { JSONContent } from "@tiptap/react";

export type TemplateKey = "blank" | "memo" | "plan" | "brief" | "report" | "meeting";

const p = (text = ""): JSONContent => (text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" });
const h = (level: number, text: string): JSONContent => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
const doc = (title: string, ...rest: JSONContent[]): JSONContent => ({ type: "doc", content: [h(1, title), ...rest] });

export const TEMPLATES: { key: TemplateKey; name: string; blurb: string; content: JSONContent }[] = [
  { key: "blank", name: "Blank", blurb: "Start from nothing.", content: doc("Untitled", p()) },
  { key: "memo", name: "Memo", blurb: "Decision first, then reasons.", content: doc("Memo", p("State the decision in one sentence."), h(2, "Why"), p(), h(2, "Next steps"), p()) },
  { key: "plan", name: "Plan", blurb: "Goals, steps, risks.", content: doc("Plan", p("What this plan achieves, and by when."), h(2, "Goals"), p(), h(2, "Steps"), p(), h(2, "Risks"), p()) },
  { key: "brief", name: "Brief", blurb: "One page, one ask.", content: doc("Brief", p("The ask and the answer needed."), h(2, "Context"), p(), h(2, "Options"), p()) },
  { key: "report", name: "Report", blurb: "Findings with numbers.", content: doc("Report", p("The main finding, with its number."), h(2, "Findings"), p(), h(2, "Sources"), p()) },
  { key: "meeting", name: "Meeting notes", blurb: "Decisions and owners.", content: doc("Meeting notes", p("Date, attendees."), h(2, "Decisions"), p(), h(2, "Action items"), { type: "taskList", content: [{ type: "taskItem", attrs: { checked: false }, content: [p()] }] }) },
];

export const templateByKey = (k: string | undefined) => TEMPLATES.find((t) => t.key === k) ?? TEMPLATES[0]!;
