import { randomUUID } from "node:crypto";
import { Fragment, Node, type Schema } from "prosemirror-model";
import { BLOCK_ID_TYPES } from "@/lib/editor/extensions";

const ID_TYPES = new Set(BLOCK_ID_TYPES);
export const newId = () => randomUUID().slice(0, 8);

const hasIdAttr = (n: Node) => ID_TYPES.has(n.type.name) && !!n.type.spec.attrs && "id" in n.type.spec.attrs;

/** Give every id-bearing node without an id (or with a duplicate) a fresh one. Existing unique ids are kept. */
export function assignIds(node: Node, _schema?: Schema, seen: Set<string> = new Set()): Node {
  if (node.isText) return node;
  let attrs = node.attrs;
  if (hasIdAttr(node)) {
    let id = (node.attrs.id as string | null) ?? null;
    if (!id || seen.has(id)) id = newId();
    seen.add(id);
    attrs = { ...node.attrs, id };
  }
  const kids: Node[] = [];
  node.forEach((c) => kids.push(assignIds(c, _schema, seen)));
  return node.type.create(attrs, node.isLeaf ? null : Fragment.from(kids), node.marks);
}

export function collectIds(node: Node): Set<string> {
  const out = new Set<string>();
  node.descendants((n) => { if (n.attrs.id) out.add(n.attrs.id as string); });
  return out;
}
