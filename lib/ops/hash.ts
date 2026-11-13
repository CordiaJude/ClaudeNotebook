import { createHash } from "node:crypto";
import type { Node } from "prosemirror-model";

/** Stable content hash of a node. Ignores `id` attributes so a block keeps its hash when only ids are (re)assigned. */
function canon(json: unknown): unknown {
  if (Array.isArray(json)) return json.map(canon);
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) {
      if (k === "id") continue;
      const v = o[k];
      if (k === "attrs" && v && typeof v === "object") {
        const a: Record<string, unknown> = {};
        for (const ak of Object.keys(v as object).sort()) if (ak !== "id" && (v as Record<string, unknown>)[ak] != null) a[ak] = (v as Record<string, unknown>)[ak];
        if (Object.keys(a).length) out[k] = a;
      } else out[k] = canon(v);
    }
    return out;
  }
  return json;
}

export const blockHash = (node: Node): string => createHash("sha1").update(JSON.stringify(canon(node.toJSON()))).digest("hex").slice(0, 8);
