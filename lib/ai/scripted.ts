/* A stand-in for a real model, so the whole product can run, be demoed and be tested with no model key.
   It follows the same tool contract a real model would: questions first, then a layout, then one section per call.
   Its writing is canned. The UI labels it as a demo. /replica-backend connects a real model behind the same interface. */
import type { Block, Model, Msg, Turn } from "./types";

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("stopped", "AbortError"));
    if (ms <= 0) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("stopped", "AbortError")); }, { once: true });
  });

const textOf = (m: Msg): string => (typeof m.content === "string" ? m.content : m.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n"));
const part = (text: string, tag: string): string => { const i = text.lastIndexOf(`[${tag}]`); if (i < 0) return ""; const rest = text.slice(i + tag.length + 2); const j = rest.search(/\n\[[A-Z][A-Za-z ]+\]\n?/); return (j < 0 ? rest : rest.slice(0, j)).trim(); };
const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** "Write a one-page plan for the Q1 launch" -> "plan for the Q1 launch". */
export function subjectOf(request: string): string {
  let s = request.trim().replace(/[.!?]+$/, "");
  s = s.replace(/^(please\s+)?(can you\s+|could you\s+)?(write|draft|create|make|prepare|put together|give me|i need|i want)\s+(me\s+)?/i, "");
  s = s.replace(/^(an?|the|some)\s+/i, "").replace(/^(one[- ]page|two[- ]page|short|brief|quick|simple|detailed)\s+/i, "");
  return s.slice(0, 80) || "new document";
}
const typeOf = (subject: string) => (/(plan|roadmap)/i.test(subject) ? "plan" : /(memo|proposal|recommendation|brief)/i.test(subject) ? "memo" : /(report|update|review|summary)/i.test(subject) ? "report" : "note");

type Sec = { heading?: string; intent: string; write: (subject: string, audience: string) => string };
const LEAD: Sec = { intent: "The point in one paragraph", write: (s, a) => `This is the ${s}. It is written for ${a} and keeps to what they need in order to decide and act.` };
const SECTIONS: Record<string, Sec[]> = {
  plan: [
    { heading: "Goals", intent: "What success looks like, as three outcomes", write: () => "- Ship on the agreed date with no open blockers.\n- Keep the cost inside the approved budget.\n- Give every owner one clear deliverable." },
    { heading: "Timeline", intent: "Milestones with dates and owners, as a table", write: () => "| When | Milestone | Owner |\n|---|---|---|\n| Week 1 | Scope agreed | Lead |\n| Week 3 | First version ready | Team |\n| Week 5 | Review and fixes | Reviewers |\n| Week 6 | Go live | Lead |" },
    { heading: "Risks", intent: "What could slip, and the fallback for each", write: () => "- A late dependency moves the date. Fallback: cut the lowest-priority item.\n- Review takes longer than a week. Fallback: review in two smaller rounds." },
    { heading: "Next steps", intent: "The first actions, in order", write: () => "1. Confirm the owners named above.\n2. Agree the scope by the end of week 1.\n3. Book the review." },
  ],
  memo: [
    { heading: "Background", intent: "What led to this, in a few sentences", write: (s) => `The question behind this ${s} came up because the current approach no longer fits. Two things changed: the volume grew, and the team is smaller.` },
    { heading: "Recommendation", intent: "The decision asked for, and why", write: () => "Choose the simpler option now and review it in three months. It costs less, it can be undone, and it frees the team for the work that matters most." },
    { heading: "Next steps", intent: "Who does what, by when", write: () => "1. Approve the recommendation this week.\n2. Name one owner.\n3. Review the result in three months." },
  ],
  report: [
    { heading: "What happened", intent: "The main result, with its number", write: () => "The main result held: the work finished on time, and the key measure moved in the right direction." },
    { heading: "Numbers", intent: "The figures behind the result, as a table", write: () => "| Measure | Before | After |\n|---|---|---|\n| Volume | 100 | 114 |\n| Time to finish | 6 days | 4 days |" },
    { heading: "What is next", intent: "The follow-up work", write: () => "- Keep the change that worked.\n- Look into the one measure that did not move." },
  ],
  note: [
    { heading: "Background", intent: "The context a reader needs", write: (s) => `Some context for the ${s}: where things stand today and why this is being written now.` },
    { heading: "Details", intent: "The substance, in order of importance", write: () => "- The most important point comes first.\n- Supporting points follow, one per line.\n- Anything uncertain is marked as an open question." },
    { heading: "Next steps", intent: "What happens after this", write: () => "1. Share this with the people it affects.\n2. Collect comments.\n3. Update it once." },
  ],
};
const planFor = (subject: string, long: boolean): Sec[] => { const all = SECTIONS[typeOf(subject)]!; return [LEAD, ...(long ? all : all.slice(0, 2))]; };

/** How the demo rewrites a selection. Deterministic, so tests can rely on it. */
export function rewrite(text: string, instruction: string): string {
  const i = instruction.toLowerCase();
  const flat = text.replace(/\s+/g, " ").trim();
  if (/upper|capital/.test(i)) return text.toUpperCase();
  if (/lower/.test(i)) return text.toLowerCase();
  if (/short|tight|brief|concise|cut/.test(i)) {
    const first = flat.match(/^.*?[.!?](\s|$)/)?.[0]?.trim();
    if (first && first.length < flat.length) return first;
    const words = flat.split(" ");
    return words.slice(0, Math.max(1, Math.ceil(words.length / 2))).join(" ");
  }
  if (/formal/.test(i)) return flat.replace(/\bcan't\b/gi, "cannot").replace(/\bwon't\b/gi, "will not").replace(/\bdon't\b/gi, "do not").replace(/\bit's\b/gi, "it is").replace(/\bwe're\b/gi, "we are");
  if (/bullet|list/.test(i) && text.includes(".")) return flat.split(/(?<=[.!?])\s+/).filter(Boolean).map((s) => `- ${s}`).join("\n");
  if (/warm|friendl|kind/.test(i)) return `${flat.replace(/[.!?]+$/, "")}, and thank you.`;
  return `${flat.replace(/[.!?]+$/, "")} (revised).`;
}

let seq = 0;
const toolCall = (name: string, input: Record<string, unknown>): Block => ({ type: "tool_use", id: `demo_${++seq}`, name, input });

export function scriptedModel(opts: { wordMs?: number; toolMs?: number } = {}): Model {
  const wordMs = opts.wordMs ?? Number(process.env.DEMO_AI_WORD_MS ?? 18);
  const toolMs = opts.toolMs ?? Number(process.env.DEMO_AI_TOOL_MS ?? 600);
  return {
    name: "demo-script",
    demo: true,
    async turn({ tools, messages, signal, onText }): Promise<Turn> {
      const say = async (t: string): Promise<Turn> => {
        for (const w of t.split(/(?<=\s)/)) { await sleep(wordMs, signal); onText?.(w); }
        return { blocks: [{ type: "text", text: t }], stop: "end", usage: { input: 0, output: 0 } };
      };
      const call = async (b: Block): Promise<Turn> => { await sleep(toolMs, signal); return { blocks: [b], stop: "tool", usage: { input: 0, output: 0 } }; };

      const lastUser = messages.findLastIndex((m) => m.role === "user" && typeof m.content === "string");
      const userText = lastUser >= 0 ? textOf(messages[lastUser]!) : "";
      const since = messages.slice(lastUser + 1);
      const calls = since.flatMap((m) => (typeof m.content === "string" ? [] : m.content.filter((b) => b.type === "tool_use"))) as Extract<Block, { type: "tool_use" }>[];
      const results = since.flatMap((m) => (typeof m.content === "string" ? [] : m.content.filter((b) => b.type === "tool_result"))) as Extract<Block, { type: "tool_result" }>[];
      const lastCall = calls.at(-1), lastResult = results.at(-1);

      // ---- "Edit with AI": one tool, one call
      if (tools.some((t) => t.name === "replace_selection")) {
        if (lastCall) return lastResult?.is_error ? say(lastResult.content) : say("Rewrote the selection.");
        const selected = part(userText, "Selected text").replace(/^<<<\n?/, "").replace(/\n?>>>$/, "");
        return call(toolCall("replace_selection", { text: rewrite(selected, part(userText, "Instruction")) }));
      }

      const blank = /Document: blank/.test(part(userText, "Context"));
      const answersRaw = part(userText, "Answers");
      const request = part(userText, "Request") || [...messages].reverse().map(textOf).map((t) => part(t, "Request")).find(Boolean) || "";

      // ---- continuing after a tool result
      if (lastCall) {
        if (lastResult?.is_error && lastCall.name !== "write_section") return say(`I could not make that change. ${lastResult.content.split("\n")[0]}`);
        if (lastCall.name === "lay_out_document" || lastCall.name === "write_section") {
          const laid = calls.find((c) => c.name === "lay_out_document");
          const laidResult = results.find((r) => r.tool_use_id === laid?.id)?.content ?? "";
          const slots = [...laidResult.matchAll(/section_id (\S+): (.+)/g)].map((m) => ({ id: m[1]!, heading: m[2]! }));
          const done = new Set(calls.filter((c) => c.name === "write_section").map((c) => String(c.input.section_id)));
          const next = slots.find((s) => !done.has(s.id));
          const subject = subjectOf(String(laid?.input.title ?? request));
          if (!next) return say(`Drafted ${slots.length} section${slots.length === 1 ? "" : "s"}. Ask for a change here, or select text and choose Edit with AI.`);
          const plan = planFor(subject, slots.length > 3);
          const sec = plan[slots.indexOf(next)] ?? plan.at(-1)!;
          const audience = /audience: (.+)/i.exec(messages.map(textOf).join("\n"))?.[1]?.trim().toLowerCase() ?? "the people who will read it";
          return call(toolCall("write_section", { section_id: next.id, markdown: sec.write(subject, audience) }));
        }
        if (lastCall.name === "read_document" && lastCall.input.view === "outline") {
          const blocks = [...(lastResult?.content ?? "").matchAll(/\[(\S+) v(\S+)\] paragraph: (.*)/g)].map((m) => ({ id: m[1]!, version: m[2]!, text: m[3]! }));
          const longest = blocks.sort((a, b) => b.text.length - a.text.length)[0];
          if (!longest) return say("There is no paragraph to shorten yet.");
          return call(toolCall("read_document", { view: "block", block_id: longest.id }));
        }
        if (lastCall.name === "read_document" && lastCall.input.view === "block") {
          const outlineCall = results[0]?.content ?? "";
          const version = new RegExp(`\\[${String(lastCall.input.block_id)} v(\\S+)\\]`).exec(outlineCall)?.[1] ?? "";
          return call(toolCall("replace_block", { block_id: lastCall.input.block_id, version, markdown: rewrite(lastResult?.content ?? "", "shorter") }));
        }
        if (lastCall.name === "replace_block") return say("Shortened the longest paragraph.");
        if (lastCall.name === "insert_blocks") return say("Added it at the end of the document.");
        if (lastCall.name === "set_title") return say("Renamed the document.");
        return say("Done.");
      }

      // ---- a new request
      if (blank) {
        if (!answersRaw) {
          return call(toolCall("ask_questions", { questions: [
            { id: "audience", prompt: "Who is this for?", options: ["My team", "Leadership", "Customers"] },
            { id: "length", prompt: "How long should it be?", options: ["One page", "Two to three pages"] },
          ] }));
        }
        const subject = subjectOf(request);
        const long = /two|three|long/i.test(answersRaw);
        return call(toolCall("lay_out_document", { title: cap(subject), sections: planFor(subject, long).map((s) => ({ ...(s.heading ? { heading: s.heading } : {}), intent: s.intent })) }));
      }
      const ask = request.trim();
      const section = /add .*?\b(?:section|part|paragraph)\b.*?\b(?:called|titled|named) ["“]?(.+?)["”]?(?= with\b| that\b| which\b|[.!?,]|$)/i.exec(ask)?.[1] ?? /add (?:a |an |another )?(?:new )?(?:section|part|paragraph)(?: (?:on|about|for|called|covering))? (.+)/i.exec(ask)?.[1] ?? /add (?:a |an )?(.+?) section/i.exec(ask)?.[1];
      if (section) { const h = cap(section.replace(/[.!?]+$/, "")); return call(toolCall("insert_blocks", { position: "end", markdown: `## ${h}\n\nThis section covers ${section.replace(/[.!?]+$/, "").toLowerCase()}: the current state, what should change, and who owns it.` })); }
      const title = /(?:rename (?:it |this )?to|call it|title it) (.+)/i.exec(ask)?.[1];
      if (title) return call(toolCall("set_title", { title: title.replace(/^["“]|["”.]+$/g, "") }));
      if (/short|tight|concise|brief|trim/i.test(ask)) return call(toolCall("read_document", { view: "outline" }));
      return say("The demo AI can draft a new document, add a section, shorten the longest paragraph, rename the document, and rewrite a selection. Connect a real model to go further.");
    },
  };
}
