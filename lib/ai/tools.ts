/* The tools the model can call, and the code that carries each call out. The model never writes into the document
   itself: each call becomes one atomic change, made as the asking person, with their role checked first. */
import type { Node } from "prosemirror-model";
import { deleteBlock, fillSlot, insertBlocks, layOut, replaceBlock, replaceText, setTitle, type Result, type UndoEntry } from "@/lib/doc/edit";
import { blockMarkdown, outline, searchBlocks } from "@/lib/doc/read";
import { replaceSelection, resolveScope } from "@/lib/doc/range";
import type { Scope } from "@/lib/doc/scope";
import { docSchema } from "@/lib/doc/schema";
import { loadYDoc, readDoc, writeDoc } from "@/lib/doc/ydoc";
import { canEdit, type Data, type Question, type Tab } from "@/lib/data/types";
import type { RoomStore } from "@/lib/rooms/types";
import type { RunEvent, ToolDef } from "./types";

const str = (description: string) => ({ type: "string", description });
const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", properties, required, additionalProperties: false });

export const CHAT_TOOLS: ToolDef[] = [
  { name: "ask_questions", description: "Ask the person one to three short questions before drafting a new document. The run pauses until they answer or skip.",
    input: obj({ questions: { type: "array", minItems: 1, maxItems: 3, items: obj({ id: str("A short key, e.g. audience"), prompt: str("The question"), options: { type: "array", maxItems: 4, items: { type: "string" }, description: "Likely answers the person can pick" } }, ["id", "prompt"]) } }, ["questions"]) },
  { name: "lay_out_document", description: "Plan a new document on a blank page: its title and its sections. Each section appears as a placeholder that says what it will cover. Returns the id of each placeholder.",
    input: obj({ title: str("The document's title"), sections: { type: "array", minItems: 1, maxItems: 20, items: obj({ heading: str("The section heading. Omit it for an opening paragraph."), intent: str("One line: what this section will cover") }, ["intent"]) } }, ["title", "sections"]) },
  { name: "write_section", description: "Write one planned section. The placeholder with this id is replaced by the markdown. Call once per section, in reading order.",
    input: obj({ section_id: str("The placeholder id from lay_out_document"), markdown: str("The section's content. Do not repeat its heading.") }, ["section_id", "markdown"]) },
  { name: "read_document", description: 'Read the document. "outline" lists every block as [id vVERSION] kind: start of text. "block" returns one block in full. "search" lists blocks containing some words.',
    input: obj({ view: { type: "string", enum: ["outline", "block", "search"] }, block_id: str("For view block"), query: str("For view search") }, ["view"]) },
  { name: "replace_text", description: "Change some words inside one block and keep the rest of the block, formatting included.",
    input: obj({ block_id: str("The block's id"), find: str("The words exactly as they stand now"), replace_with: str("The new words"), occurrence: { type: "integer", minimum: 1, description: "Which match, when the words repeat (1 is the first)" } }, ["block_id", "find", "replace_with"]) },
  { name: "replace_block", description: "Replace one whole block with new markdown.",
    input: obj({ block_id: str("The block's id"), version: str("The block's version from read_document, so a person's newer edit is never overwritten"), markdown: str("The new content") }, ["block_id", "version", "markdown"]) },
  { name: "insert_blocks", description: "Add new content after a block, or at the start or end of the document.",
    input: obj({ after_block_id: str("Insert after this block"), position: { type: "string", enum: ["start", "end"], description: "Used when after_block_id is not given" }, markdown: str("The content to add") }, ["markdown"]) },
  { name: "delete_block", description: "Remove one block.", input: obj({ block_id: str("The block's id"), version: str("The block's version from read_document") }, ["block_id", "version"]) },
  { name: "set_title", description: "Change the document's title.", input: obj({ title: str("The new title") }, ["title"]) },
];
export const SELECTION_TOOLS: ToolDef[] = [
  { name: "replace_selection", description: "Replace the selected text, and only the selected text, with new text.", input: obj({ text: str("What replaces the selection, as markdown. One line when the selection is part of a paragraph.") }, ["text"]) },
];

export type ToolCtx = {
  data: Data; rooms: RoomStore; userId: string; artifactId: string; tab: Tab; runId: string;
  undo: UndoEntry[]; emit: (e: RunEvent) => void;
  /** Selection runs only: the one range this run may change. */
  scope?: Scope;
  sections: { id: string; heading: string }[]; written: number;
  asked?: Question[];
};
export type ToolOutcome = { content: string; isError?: boolean };

async function load(ctx: ToolCtx): Promise<{ doc: Node; ydoc: ReturnType<typeof loadYDoc> }> {
  const state = await ctx.rooms.read(ctx.tab.room);
  if (!state) throw new Error("The document could not be opened.");
  const ydoc = loadYDoc(state);
  return { doc: readDoc(ydoc, docSchema()), ydoc };
}

/** One change to the document: check the person may still edit, read the newest state, apply, send only the difference. */
export async function change(ctx: ToolCtx, fn: (doc: Node) => Result): Promise<Result> {
  if (!canEdit(await ctx.data.roleOn(ctx.userId, ctx.artifactId))) return { ok: false, reason: "invalid", message: "This person can no longer edit this document, so nothing was changed. Stop here." };
  const { doc, ydoc } = await load(ctx);
  const res = fn(doc);
  if (!res.ok) return res;
  await ctx.rooms.apply(ctx.tab.room, writeDoc(ydoc, res.doc, `ai:${ctx.runId}`), `ai:${ctx.runId}`);
  ctx.undo.push(res.undo);
  await ctx.data.updateRun(ctx.runId, { undo: ctx.undo });
  return res;
}

const told = (r: Result, done: string): ToolOutcome =>
  r.ok ? { content: `${done} ${r.changed.map((c) => `[${c.id} v${c.version}]`).join(" ")}`.trim() } : { content: r.message + (r.current ? `\nCurrent content:\n${r.current}` : ""), isError: true };
const text = (v: unknown, max = 60_000) => (typeof v === "string" ? v.slice(0, max) : "");

export async function runTool(ctx: ToolCtx, name: string, input: Record<string, unknown>): Promise<ToolOutcome> {
  switch (name) {
    case "ask_questions": {
      const raw = Array.isArray(input.questions) ? input.questions : [];
      const questions: Question[] = raw.slice(0, 3).flatMap((q, i) => {
        const o = q as Record<string, unknown>;
        const prompt = text(o.prompt, 200).trim();
        if (!prompt) return [];
        const options = Array.isArray(o.options) ? o.options.map((x) => text(x, 60).trim()).filter(Boolean).slice(0, 4) : undefined;
        return [{ id: text(o.id, 40).trim() || `q${i + 1}`, prompt, ...(options?.length ? { options } : {}) }];
      });
      if (questions.length === 0) return { content: "Give at least one question with a prompt.", isError: true };
      ctx.asked = questions;
      return { content: "The questions are shown to the person. Wait for their answers." };
    }
    case "lay_out_document": {
      const sections = (Array.isArray(input.sections) ? input.sections : []).map((s) => ({ heading: text((s as Record<string, unknown>).heading, 200) || null, intent: text((s as Record<string, unknown>).intent, 300) }));
      const res = await change(ctx, (doc) => layOut(doc, { title: text(input.title, 200), sections }));
      if (!res.ok) return told(res, "");
      const slots: { id: string; heading: string }[] = [];
      let heading = "";
      res.doc.forEach((n) => { if (n.type.name === "heading") heading = n.textContent; else if (n.type.name === "draftSlot") { slots.push({ id: String(n.attrs.id), heading: heading || "Opening" }); heading = ""; } });
      ctx.sections = slots; ctx.written = 0;
      ctx.emit({ type: "progress", label: `Outlined ${slots.length} section${slots.length === 1 ? "" : "s"}`, done: true });
      return { content: `Laid out. Write each section with write_section:\n${slots.map((s) => `section_id ${s.id}: ${s.heading}`).join("\n")}` };
    }
    case "write_section": {
      const id = text(input.section_id, 40);
      const i = ctx.sections.findIndex((s) => s.id === id);
      const label = i >= 0 ? `Drafting section ${i + 1} of ${ctx.sections.length}: ${ctx.sections[i]!.heading}` : "Drafting a section";
      ctx.emit({ type: "progress", label });
      await ctx.data.updateRun(ctx.runId, { section: i >= 0 ? ctx.sections[i]!.heading : undefined });
      const res = await change(ctx, (doc) => fillSlot(doc, id, text(input.markdown)));
      if (res.ok) ctx.written++;
      ctx.emit({ type: "progress", label: res.ok ? label.replace("Drafting", "Drafted") : `Skipped a section a person removed`, done: true });
      return told(res, "Written.");
    }
    case "read_document": {
      const { doc } = await load(ctx);
      if (input.view === "block") return { content: blockMarkdown(doc, text(input.block_id, 40)) ?? "That block is not in the document. Read the outline." };
      if (input.view === "search") return { content: searchBlocks(doc, text(input.query, 200)) };
      return { content: outline(doc) };
    }
    case "replace_text": return told(await change(ctx, (doc) => replaceText(doc, text(input.block_id, 40), text(input.find, 2000), text(input.replace_with, 20_000), typeof input.occurrence === "number" ? input.occurrence : undefined)), "Changed.");
    case "replace_block": return told(await change(ctx, (doc) => replaceBlock(doc, text(input.block_id, 40), text(input.markdown), text(input.version, 20) || undefined)), "Replaced.");
    case "insert_blocks": return told(await change(ctx, (doc) => insertBlocks(doc, input.after_block_id ? { after: text(input.after_block_id, 40) } : { at: input.position === "start" ? "start" : "end" }, text(input.markdown))), "Inserted.");
    case "delete_block": return told(await change(ctx, (doc) => deleteBlock(doc, text(input.block_id, 40), text(input.version, 20) || undefined)), "Removed.");
    case "set_title": return told(await change(ctx, (doc) => setTitle(doc, text(input.title, 200))), "Title set.");
    case "replace_selection": {
      const scope = ctx.scope;
      if (!scope) return { content: "There is no selection in this run.", isError: true };
      // Find the range on the document as it is NOW (a person may have typed since the request), then replace only it.
      const res = await change(ctx, (doc) => { const at = resolveScope(doc, scope); return at.ok ? replaceSelection(doc, at.from, at.to, text(input.text, 20_000)) : at; });
      return told(res, "Replaced.");
    }
    default: return { content: `There is no tool called ${name}.`, isError: true };
  }
}
