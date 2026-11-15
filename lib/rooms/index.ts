import "server-only";
import { plainText, titleOf } from "@/lib/doc/read";
import { docSchema } from "@/lib/doc/schema";
import { loadYDoc, readDoc } from "@/lib/doc/ydoc";
import { getData } from "@/lib/data";
import { localRooms } from "./local";
import type { RoomStore } from "./types";

/** The one place that chooses where live documents are kept. */
export const rooms = (): RoomStore => localRooms;

// Autosave's second half: a moment after a room changes, copy its text to the data layer (library search, titles, "edited" times).
const g = globalThis as typeof globalThis & { __mirrorTimers?: Map<string, ReturnType<typeof setTimeout>>; __mirrorOn?: boolean };
const timers = (g.__mirrorTimers ??= new Map());
if (!g.__mirrorOn) {
  g.__mirrorOn = true;
  localRooms.watch((room) => {
    clearTimeout(timers.get(room));
    timers.set(room, setTimeout(() => { timers.delete(room); void mirror(room); }, 400));
  });
}
/** Run every pending copy now. Pages that list documents call this first, so a title typed a moment ago is already there. */
export async function flushMirrors(): Promise<void> {
  const pending = [...timers.keys()];
  for (const room of pending) { clearTimeout(timers.get(room)); timers.delete(room); }
  await Promise.all(pending.map(mirror));
}
export async function mirror(room: string): Promise<void> {
  const tab = await getData().tabByRoom(room);
  const state = await localRooms.read(room);
  if (!tab || !state) return;
  try {
    const doc = readDoc(loadYDoc(state), docSchema());
    await getData().saveMirror(tab.id, { text: plainText(doc), title: titleOf(doc) });
  } catch { /* a half-synced document: the next change mirrors it */ }
}
