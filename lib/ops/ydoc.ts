import * as Y from "yjs";
import { updateYFragment, yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";
import type { Node, Schema } from "prosemirror-model";

/** The Yjs field the editor binds to (Liveblocks Tiptap extension default). */
export const FIELD = "default";

export function loadYDoc(update: Uint8Array | ArrayBuffer | null | undefined): Y.Doc {
  const doc = new Y.Doc();
  if (update && (update as Uint8Array).byteLength > 0) Y.applyUpdate(doc, update instanceof Uint8Array ? update : new Uint8Array(update));
  return doc;
}

export const readPM = (ydoc: Y.Doc, schema: Schema): Node => yXmlFragmentToProseMirrorRootNode(ydoc.getXmlFragment(FIELD), schema);

/** Diff `next` into the Yjs doc. Returns only the delta, so concurrent human edits elsewhere merge by CRDT rules. */
export function writePM(ydoc: Y.Doc, next: Node, origin: string): Uint8Array {
  const before = Y.encodeStateVector(ydoc);
  ydoc.transact(() => {
    updateYFragment(ydoc, ydoc.getXmlFragment(FIELD), next, { mapping: new Map(), isOMark: new Map() } as never);
  }, origin);
  return Y.encodeStateAsUpdate(ydoc, before);
}

/** A brand-new room: full state of a doc built from `pm`. */
export function birthUpdate(pm: Node): { ydoc: Y.Doc; update: Uint8Array } {
  const ydoc = new Y.Doc();
  const update = writePM(ydoc, pm, "agent:birth");
  return { ydoc, update };
}
