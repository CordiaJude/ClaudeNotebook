import { Fragment, type Node } from "prosemirror-model";
import { withIds } from "@/lib/doc/ids";
import { parseMarkdown } from "@/lib/doc/markdown";
import { docSchema } from "@/lib/doc/schema";

/** A document with a title and a body written as markdown. */
export function makeDoc(title: string, markdown = ""): Node {
  const s = docSchema();
  const body = markdown.trim() ? parseMarkdown(markdown) : [s.nodes.paragraph!.create()];
  return withIds(s.nodes.doc!.create(null, Fragment.from([s.nodes.title!.create(null, title ? s.text(title) : null), ...body])));
}
export const ids = (doc: Node): string[] => { const out: string[] = []; doc.forEach((n) => out.push(String(n.attrs.id))); return out; };
export const texts = (doc: Node): string[] => { const out: string[] = []; doc.forEach((n) => out.push(n.type.name === "draftSlot" ? `[slot] ${n.attrs.intent}` : n.textContent)); return out; };
/** Document position of the first occurrence of `needle`. */
export function posOf(doc: Node, needle: string): number {
  let found = -1;
  doc.descendants((n, pos) => { if (found < 0 && n.isText && n.text!.includes(needle)) found = pos + n.text!.indexOf(needle); return found < 0; });
  if (found < 0) throw new Error(`not found: ${needle}`);
  return found;
}
