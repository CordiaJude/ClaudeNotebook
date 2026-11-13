import { Fragment, type Node, type Schema } from "prosemirror-model";
import type { JSONContent } from "@tiptap/core";
import { fail } from "./errors";
import { assignIds } from "./ids";
import { markdownToJson, type ChipCtx } from "./markdown";
import type { ChipMap } from "./types";

export const MAX_BIRTH_CHARS = 30_000;
export const MAX_BIRTH_BLOCKS = 80;
export const MAX_PENDING = 40;

const today = () => new Date().toISOString().slice(0, 10);

/** Skeleton markdown -> a valid tab doc: title, byline (date chip · author chip), body (pending blocks, text). */
export function buildBirthDoc(schema: Schema, input: { title?: string; markdown: string; blocks?: ChipMap }, ctx: ChipCtx): Node {
  if (typeof input.markdown !== "string" || !input.markdown.trim()) fail("bad_request", "markdown is empty. Send the title, a byline line and one pending block per section.");
  if (input.markdown.length > MAX_BIRTH_CHARS) fail("bad_request", `markdown is over ${MAX_BIRTH_CHARS} characters. Create the skeleton first, then fill sections with notebook_edit.`);
  const { blocks } = markdownToJson(input.markdown, input.blocks ?? {}, ctx);
  if (blocks.length > MAX_BIRTH_BLOCKS) fail("too_many", `At most ${MAX_BIRTH_BLOCKS} blocks at creation. Create fewer sections now and add more later.`);
  let body = [...blocks];

  // Title: a leading H1, else the title argument.
  let title = "";
  if (body[0]?.type === "heading" && body[0].attrs?.level === 1) {
    title = (body[0].content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
    body = body.slice(1);
  }
  title = title || (input.title ?? "").trim();
  if (!title) fail("bad_request", 'The notebook needs a title: start the markdown with "# Title" or pass title.');
  title = title.slice(0, 200);

  // Byline: a first paragraph made of a date chip and a mention chip (and separators), else defaults.
  let asof = today(), authorId = ctx.me.id, authorName = ctx.me.name;
  const first = body[0];
  if (first?.type === "paragraph" && first.content?.some((c) => c.type === "dateChip") && first.content.every((c) => c.type === "dateChip" || c.type === "mentionChip" || (c.type === "text" && /^[\s·|•-]*$/.test(c.text ?? "")))) {
    const d = first.content.find((c) => c.type === "dateChip");
    const m = first.content.find((c) => c.type === "mentionChip");
    if (d?.attrs?.value) asof = String(d.attrs.value);
    if (m?.attrs?.kind === "user") { authorId = String(m.attrs.ref ?? authorId); authorName = String(m.attrs.label ?? authorName); }
    body = body.slice(1);
  }
  const pending = body.filter((b) => b.type === "pending").length;
  if (pending > MAX_PENDING) fail("too_many", `At most ${MAX_PENDING} pending blocks.`);
  if (body.length === 0) body = [{ type: "paragraph" }];

  const json: JSONContent = {
    type: "doc",
    content: [
      title ? { type: "title", content: [{ type: "text", text: title }] } : { type: "title" },
      { type: "byline", attrs: { asof, authorId, authorName } },
      ...body,
    ],
  };
  let doc: Node;
  try { doc = assignIds(schema.nodeFromJSON(json), schema); doc.check(); }
  catch (e) { return fail("bad_request", `The skeleton is not a valid document (${e instanceof Error ? e.message.slice(0, 140) : "schema"}).`); }
  return doc;
}

export const emptyBody = (doc: Node): boolean => {
  if (doc.childCount !== 3) return false;
  const p = doc.child(2);
  return p.type.name === "paragraph" && p.content.size === 0;
};
export { Fragment };
