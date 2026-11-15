import { createHash, randomUUID } from "node:crypto";
import { Fragment, type Node } from "prosemirror-model";
import { BLOCK_ID_TYPES } from "@/lib/editor/constants";

const HAS_ID = new Set(BLOCK_ID_TYPES);
export const newId = () => randomUUID().slice(0, 8);

/** Every id-bearing node gets an id; a missing or repeated one is replaced. Existing unique ids are kept. */
export function withIds(node: Node, seen: Set<string> = new Set()): Node {
  if (node.isText) return node;
  let attrs = node.attrs;
  if (HAS_ID.has(node.type.name) && node.type.spec.attrs && "id" in node.type.spec.attrs) {
    let id = (node.attrs.id as string | null) ?? null;
    if (!id || seen.has(id)) id = newId();
    seen.add(id);
    attrs = { ...node.attrs, id };
  }
  const kids: Node[] = [];
  node.forEach((c) => kids.push(withIds(c, seen)));
  return node.type.create(attrs, node.isLeaf ? null : Fragment.from(kids), node.marks);
}

function stripIds(json: unknown): unknown {
  if (Array.isArray(json)) return json.map(stripIds);
  if (json && typeof json === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(json as object).sort()) {
      if (k === "id") continue;
      const v = (json as Record<string, unknown>)[k];
      if (v != null) out[k] = stripIds(v);
    }
    return out;
  }
  return json;
}
/** A short fingerprint of a block's content. It changes when the content does, and ignores ids. */
export const versionOf = (node: Node): string => createHash("sha1").update(JSON.stringify(stripIds(node.toJSON()))).digest("hex").slice(0, 8);
