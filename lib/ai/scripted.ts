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

/** The demo's canned deck: a short one and a longer one. Layout, words and speaker notes for each slide. */
type DemoSlide = { layout: string; title: string; intent: string; fill: (subject: string, audience: string) => Record<string, string> };
const DECK: DemoSlide[] = [
  { layout: "title", title: "", intent: "The title and who it is for", fill: (s, a) => ({ title: cap(s), subtitle: `For ${a}`, notes: `Open by saying why the ${s} matters now. One sentence, then move on.` }) },
  { layout: "bullets", title: "Where we are today", intent: "The current state in three points", fill: () => ({ title: "Where we are today", body: "- The current approach works, but slowly\n- Volume grew faster than the team\n- Two steps are still done by hand", notes: "Keep this short. The audience knows most of it; name the two manual steps, because the rest of the talk is about them." }) },
  { layout: "big-number", title: "The number that matters", intent: "The one figure behind the case", fill: () => ({ number: "6 days", label: "Average time to finish, today", body: "The target is four.", notes: "Pause on the number. Then say where it comes from and that four days is the goal for next quarter." }) },
  { layout: "section", title: "The plan", intent: "A break before the plan", fill: () => ({ title: "The plan", subtitle: "Three steps, in order", notes: "Signal the change of pace: from the problem to what we will do about it." }) },
  { layout: "two-column", title: "Two options", intent: "The choice, side by side", fill: () => ({ title: "Two options", left: "- **Fix the two manual steps**\n- Six weeks\n- No new tools", right: "- **Replace the whole flow**\n- Five months\n- New vendor", notes: "Say plainly that the first option is the recommendation, and why: it is faster and it can be undone." }) },
  { layout: "quote", title: "What the team says", intent: "One sentence from the people doing the work", fill: () => ({ quote: "We lose a day every week waiting for a step nobody owns.", attribution: "Team lead, operations", notes: "Read the quote aloud, then stop for a second. It makes the case better than a chart." }) },
  { layout: "bullets", title: "Timeline", intent: "The milestones with dates", fill: () => ({ title: "Timeline", body: "- Week 1: scope agreed\n- Week 3: first step automated\n- Week 6: both steps live", notes: "Walk through the dates once. Mention that week 3 is the first point where the result is visible." }) },
  { layout: "closing", title: "Next steps", intent: "The ask", fill: () => ({ title: "Next steps", body: "- Approve option one this week\n- Name one owner\n- Review the result in six weeks", notes: "End on the ask. Say what you need from the room today, and stop." }) },
];
const deckPlan = (long: boolean) => (long ? DECK : [DECK[0]!, DECK[1]!, DECK[2]!, DECK[4]!, DECK[7]!]);

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

      // ---- a deck: questions, a plan, then one slide per call, each with its speaker notes
      if (tools.some((t) => t.name === "lay_out_deck")) {
        const ctxText = part(userText, "Context"), answers = part(userText, "Answers");
        const req = part(userText, "Request") || [...messages].reverse().map(textOf).map((t) => part(t, "Request")).find(Boolean) || "";
        const subject = subjectOf(req).replace(/^(deck|presentation|slides?)\s+(about|on|for)\s+/i, "").replace(/\s+(deck|presentation|slides)$/i, "") || "new deck";
        if (lastCall) {
          if (lastResult?.is_error && lastCall.name !== "write_slide") return say(`I could not make that change. ${lastResult.content.split("\n")[0]}`);
          if (lastCall.name === "lay_out_deck" || lastCall.name === "write_slide") {
            const laid = calls.find((c) => c.name === "lay_out_deck");
            const ids = [...(results.find((r) => r.tool_use_id === laid?.id)?.content ?? "").matchAll(/slide_id (\S+):/g)].map((m) => m[1]!);
            const done = new Set(calls.filter((c) => c.name === "write_slide").map((c) => String(c.input.slide_id)));
            const next = ids.find((id) => !done.has(id));
            if (!next) return say(`Drafted ${ids.length} slides, each with speaker notes. Ask for a change here, or edit any slide by hand.`);
            const plan = deckPlan(ids.length > 5);
            const sl = plan[ids.indexOf(next)] ?? plan.at(-1)!;
            const audience = /audience: (.+)/i.exec(messages.map(textOf).join("\n"))?.[1]?.trim().toLowerCase() ?? "the people in the room";
            return call(toolCall("write_slide", { slide_id: next, layout: sl.layout, ...sl.fill(subject, audience) }));
          }
          if (lastCall.name === "read_deck") {
            const missing = [...(lastResult?.content ?? "").matchAll(/\d+\. \[(\S+) v\S+\] \S+ (.*?) \(no notes\)/g)].map((m) => ({ id: m[1]!, title: m[2]! }));
            if (missing.length === 0) return say("Every slide already has speaker notes.");
            return call(toolCall("set_notes", { slide_id: missing[0]!.id, notes: `Introduce “${missing[0]!.title}” in one sentence, give the one example that makes it concrete, then move on.` }));
          }
          if (lastCall.name === "set_notes") return say("Wrote speaker notes for the first slide that had none.");
          if (lastCall.name === "add_slide") return say("Added the slide at the end, with speaker notes.");
          if (lastCall.name === "set_title") return say("Renamed the deck.");
          return say("Done.");
        }
        if (/Deck: blank/.test(ctxText)) {
          if (!answers) return call(toolCall("ask_questions", { questions: [
            { id: "audience", prompt: "Who is the audience?", options: ["My team", "Leadership", "Customers"] },
            { id: "length", prompt: "How long should the deck be?", options: ["About 5 slides", "About 8 slides"] },
          ] }));
          const plan = deckPlan(/8|ten|long/i.test(answers));
          return call(toolCall("lay_out_deck", { title: cap(subject), slides: plan.map((p) => ({ layout: p.layout, title: p.title || cap(subject), intent: p.intent })) }));
        }
        const about = /add (?:a |an |another )?(?:new )?slide(?: (?:on|about|for|called|covering))? (.+)/i.exec(req)?.[1]?.replace(/[.!?]+$/, "");
        if (about) return call(toolCall("add_slide", { layout: "bullets", title: cap(about), body: `- Where ${about.toLowerCase()} stands today\n- What should change\n- Who owns it`, notes: `Say why ${about.toLowerCase()} belongs in this talk, then take the three points in order.` }));
        const named = /(?:rename (?:it |this )?to|call it|title it) (.+)/i.exec(req)?.[1];
        if (named) return call(toolCall("set_title", { title: named.replace(/^["“]|["”.]+$/g, "") }));
        if (/notes/i.test(req)) return call(toolCall("read_deck", { view: "outline" }));
        return say("The demo AI can draft a new deck with speaker notes, add a slide, write missing notes, and rename the deck. Connect a real model to go further.");
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
