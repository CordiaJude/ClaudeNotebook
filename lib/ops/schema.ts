import { getSchema } from "@tiptap/core";
import type { Schema } from "prosemirror-model";
import { buildExtensions } from "@/lib/editor/extensions";

let cached: Schema | null = null;
/** The editor schema without a browser: used by the op engine and the agent. */
export function serverSchema(): Schema {
  cached ??= getSchema(buildExtensions({ onSlash: () => {}, history: true }));
  return cached;
}
