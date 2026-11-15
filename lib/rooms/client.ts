"use client";
/* Browser side of the local live-document transport. Keeps a Yjs document in step with the server:
   updates stream down over SSE, local changes go up in small batches. Reconnects by itself. */
import * as Y from "yjs";

export type RoomStatus = "connecting" | "connected" | "reconnecting" | "failed";
export type RoomConnection = { ydoc: Y.Doc; synced: Promise<void>; destroy(): void };

const toB64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function connectRoom(room: string, opts: { canWrite: boolean; onStatus?: (s: RoomStatus) => void; onSaving?: (pending: boolean) => void }): RoomConnection {
  const ydoc = new Y.Doc();
  const client = Math.random().toString(36).slice(2);
  const url = `/api/rooms/${encodeURIComponent(room)}`;
  let closed = false, failures = 0;
  let resolveSynced: () => void = () => {};
  const synced = new Promise<void>((r) => { resolveSynced = r; });

  const es = new EventSource(`${url}?client=${client}`);
  es.addEventListener("sync", (e) => { if ((e as MessageEvent).data) Y.applyUpdate(ydoc, fromB64((e as MessageEvent).data), "remote"); failures = 0; opts.onStatus?.("connected"); resolveSynced(); });
  es.addEventListener("update", (e) => Y.applyUpdate(ydoc, fromB64((e as MessageEvent).data), "remote"));
  es.onerror = () => {
    if (closed) return;
    // EventSource retries on its own. A stream that never opens (signed out, no access) is a failure, not a reconnect.
    opts.onStatus?.(es.readyState === EventSource.CLOSED || ++failures > 5 ? "failed" : "reconnecting");
  };

  let queue: Uint8Array[] = [], timer: ReturnType<typeof setTimeout> | undefined, sending = false;
  const flush = async () => {
    timer = undefined;
    if (sending || queue.length === 0 || closed) return;
    sending = true;
    const batch = queue; queue = [];
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client, update: toB64(Y.mergeUpdates(batch)) }) });
      if (!res.ok) throw new Error(String(res.status));
      if (queue.length === 0) opts.onSaving?.(false);
    } catch {
      queue = [...batch, ...queue]; // keep the edits and try again
      opts.onStatus?.("reconnecting");
      timer = setTimeout(flush, 2000);
    } finally { sending = false; if (queue.length && !timer) timer = setTimeout(flush, 60); }
  };
  ydoc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin === "remote" || !opts.canWrite) return;
    queue.push(update);
    opts.onSaving?.(true);
    timer ??= setTimeout(flush, 60);
  });

  return { ydoc, synced, destroy() { closed = true; es.close(); clearTimeout(timer); ydoc.destroy(); } };
}
