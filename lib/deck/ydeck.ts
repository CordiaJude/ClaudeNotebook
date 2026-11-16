/* A deck inside a live (Yjs) document. Slides and their elements are separate shared objects, so two people (or a
   person and the AI) changing different slides, or different properties of one element, both keep their change.
   Works the same in the browser and on the server; the server only ever passes bytes around. */
import * as Y from "yjs";
import type { Deck, El, Slide } from "./types";

export const DECK_FIELD = "deck";
type Json = Record<string, unknown>;
const LISTS = new Set(["slides", "elements"]);

const toYList = (items: Json[]): Y.Array<Y.Map<unknown>> => { const a = new Y.Array<Y.Map<unknown>>(); a.push(items.map(toY)); return a; };
function toY(obj: Json): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    m.set(k, LISTS.has(k) && Array.isArray(v) ? toYList(v as Json[]) : v);
  }
  return m;
}
function syncList(arr: Y.Array<Y.Map<unknown>>, items: Json[]) {
  const want = new Set(items.map((i) => i.id));
  for (let i = arr.length - 1; i >= 0; i--) if (!want.has(arr.get(i).get("id"))) arr.delete(i, 1);
  items.forEach((item, i) => {
    if (arr.get(i)?.get("id") !== item.id) {
      // Not where it should be: it is new, or it moved. A moved item is taken out and put back in its new place.
      for (let j = i + 1; j < arr.length; j++) if (arr.get(j).get("id") === item.id) { arr.delete(j, 1); break; }
      arr.insert(i, [toY(item)]);
    } else syncMap(arr.get(i), item);
  });
}
function syncMap(m: Y.Map<unknown>, obj: Json) {
  for (const k of [...m.keys()]) if (obj[k] === undefined) m.delete(k);
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (LISTS.has(k) && Array.isArray(v)) {
      const cur = m.get(k);
      if (cur instanceof Y.Array) syncList(cur as Y.Array<Y.Map<unknown>>, v as Json[]); else m.set(k, toYList(v as Json[]));
    } else if (m.get(k) !== v) m.set(k, v);
  }
}

export function readDeck(ydoc: Y.Doc): Deck {
  const j = ydoc.getMap(DECK_FIELD).toJSON() as Partial<Deck>;
  const slides = (Array.isArray(j.slides) ? j.slides : []).filter((s): s is Slide => !!s && typeof s.id === "string")
    .map((s) => ({ ...s, notes: typeof s.notes === "string" ? s.notes : "", elements: (Array.isArray(s.elements) ? s.elements : []).filter((e): e is El => !!e && typeof e.id === "string") }));
  return { title: typeof j.title === "string" ? j.title : "", slides };
}
/** Writes `next` into the live document, touching only what differs, and returns just that difference. */
export function writeDeck(ydoc: Y.Doc, next: Deck, origin: unknown): Uint8Array {
  const before = Y.encodeStateVector(ydoc);
  ydoc.transact(() => syncMap(ydoc.getMap(DECK_FIELD), next as unknown as Json), origin);
  return Y.encodeStateAsUpdate(ydoc, before);
}
export function loadDeck(update: Uint8Array | null | undefined): { ydoc: Y.Doc; deck: Deck } {
  const ydoc = new Y.Doc();
  if (update && update.byteLength > 0) Y.applyUpdate(ydoc, update);
  return { ydoc, deck: readDeck(ydoc) };
}
/** The full state of a new room holding `deck`. */
export function initialDeckUpdate(deck: Deck): Uint8Array {
  const ydoc = new Y.Doc();
  writeDeck(ydoc, deck, "init");
  return Y.encodeStateAsUpdate(ydoc);
}
/** True when these bytes hold a deck rather than a doc. */
export const holdsDeck = (ydoc: Y.Doc) => ydoc.getMap(DECK_FIELD).has("slides");
