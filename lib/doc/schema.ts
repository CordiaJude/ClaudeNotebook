import { getSchema } from "@tiptap/core";
import type { Schema } from "prosemirror-model";
import { buildExtensions } from "@/lib/editor/extensions";

let cached: Schema | null = null;
/** The document schema without a browser. The server reads and edits documents with it. */
export function docSchema(): Schema {
  cached ??= getSchema(buildExtensions({ history: true }));
  return cached;
}
