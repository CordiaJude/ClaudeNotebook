/* Live documents held in this server process. For development, demos and tests: nothing is needed from outside,
   and everything is lost when the process stops. /replica-backend adds the hosted store behind the same interface.

   Rooms are kept as bytes (one merged Yjs update each), never as live Yjs objects. The server bundle can hold more
   than one copy of the Yjs library, and objects made by one copy must not be handed to another; bytes are safe. */
import * as Y from "yjs";
import type { RoomStore } from "./types";

type Listener = (update: Uint8Array, origin: string | undefined) => void;
type Room = { state: Uint8Array; listeners: Set<Listener>; applied: number };
type State = { rooms: Map<string, Room>; watchers: Set<(room: string) => void> };

const g = globalThis as typeof globalThis & { __localRooms?: State };
const state: State = (g.__localRooms ??= { rooms: new Map(), watchers: new Set() });

/** Fold many small updates into one compact state now and then. */
function compact(bytes: Uint8Array): Uint8Array {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, bytes);
  const out = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return out;
}

export const localRooms: RoomStore & {
  subscribe(room: string, fn: Listener): () => void;
  /** Called after any room changes (used to keep the searchable copy fresh). */
  watch(fn: (room: string) => void): void;
  /** Forget a room entirely (resetting the demo data). */
  drop(room: string): void;
} = {
  async read(room) { return state.rooms.get(room)?.state ?? null; },
  async create(room, initial) {
    if (!state.rooms.has(room)) state.rooms.set(room, { state: initial, listeners: new Set(), applied: 0 });
  },
  async apply(room, update, origin) {
    const r = state.rooms.get(room);
    if (!r) throw new Error(`no such room: ${room}`);
    r.state = Y.mergeUpdates([r.state, update]);
    if (++r.applied % 50 === 0) r.state = compact(r.state);
    for (const fn of r.listeners) fn(update, origin);
    for (const fn of state.watchers) fn(room);
  },
  subscribe(room, fn) {
    const r = state.rooms.get(room);
    if (!r) return () => {};
    r.listeners.add(fn);
    return () => r.listeners.delete(fn);
  },
  watch(fn) { state.watchers.add(fn); },
  drop(room) { state.rooms.delete(room); },
};
