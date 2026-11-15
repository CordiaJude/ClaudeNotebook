import * as Y from "yjs";
import { updateYFragment, yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";
import type { Node, Schema } from "prosemirror-model";

/** The Yjs field the editor binds to. */
export const FIELD = "default";

export function loadYDoc(update: Uint8Array | null | undefined): Y.Doc {
  const doc = new Y.Doc();
  if (update && update.byteLength > 0) Y.applyUpdate(doc, update);
  return doc;
}

export const readDoc = (ydoc: Y.Doc, schema: Schema): Node => yXmlFragmentToProseMirrorRootNode(ydoc.getXmlFragment(FIELD), schema);

/** Writes `next` into the Yjs doc and returns only the difference, so edits made elsewhere at the same time merge instead of being overwritten. */
export function writeDoc(ydoc: Y.Doc, next: Node, origin: string): Uint8Array {
  const before = Y.encodeStateVector(ydoc);
  ydoc.transact(() => {
    updateYFragment(ydoc, ydoc.getXmlFragment(FIELD), next, { mapping: new Map(), isOMark: new Map() } as never);
  }, origin);
  return Y.encodeStateAsUpdate(ydoc, before);
}

/** The full state of a new room holding `doc`. */
export function initialUpdate(doc: Node): Uint8Array {
  const ydoc = new Y.Doc();
  writeDoc(ydoc, doc, "init");
  return Y.encodeStateAsUpdate(ydoc);
}
