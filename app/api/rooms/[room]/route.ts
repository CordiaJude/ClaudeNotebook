/* The local live-document transport: a stream of Yjs updates down, a POST of updates up.
   Reading needs any role on the document; writing needs owner or editor. Checked on every request. */
import type { NextRequest } from "next/server";
import { canEdit, getData } from "@/lib/data";
import { answerError, problem } from "@/lib/http";
import { localRooms } from "@/lib/rooms/local";
import "@/lib/rooms"; // starts the mirror that keeps library search and "edited" times fresh
import { currentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

async function access(room: string) {
  const user = await currentUser();
  if (!user) return { error: problem("unauthenticated", "Sign in first.") } as const;
  const tab = await getData().tabByRoom(room);
  const role = tab ? await getData().roleOn(user.id, tab.artifactId) : null;
  if (!tab || !role) return { error: problem("not_found", "That doc was not found, or it is not shared with you.") } as const;
  return { role } as const;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ room: string }> }) {
  try {
    const { room } = await params;
    const a = await access(room);
    if ("error" in a) return a.error;
    const client = req.nextUrl.searchParams.get("client") ?? "";
    const enc = new TextEncoder();
    let off = () => {};
    let ping: ReturnType<typeof setInterval>;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: string) => { try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${data}\n\n`)); } catch { off(); } };
        off = localRooms.subscribe(room, (update, origin) => { if (origin !== client) send("update", b64(update)); });
        const state = await localRooms.read(room);
        send("sync", state ? b64(state) : "");
        // Every few seconds: keep the connection alive, and end it if this person's access was removed meanwhile.
        ping = setInterval(async () => {
          const still = await access(room).catch(() => null);
          if (!still || "error" in still) { send("revoked", "1"); off(); clearInterval(ping); try { controller.close(); } catch { /* closed */ } return; }
          send("ping", "1");
        }, Number(process.env.ROOM_RECHECK_MS ?? 10_000));
        req.signal.addEventListener("abort", () => { off(); clearInterval(ping); try { controller.close(); } catch { /* closed */ } }, { once: true });
      },
      cancel() { off(); clearInterval(ping); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
  } catch (e) { return answerError(e); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ room: string }> }) {
  try {
    const { room } = await params;
    const a = await access(room);
    if ("error" in a) return a.error;
    if (!canEdit(a.role)) return problem("forbidden", "You can view this, not change it.");
    const body = (await req.json().catch(() => null)) as { update?: string; client?: string } | null;
    if (!body?.update || body.update.length > 4_000_000) return problem("invalid", "Missing or oversized update.");
    await localRooms.apply(room, new Uint8Array(Buffer.from(body.update, "base64")), body.client);
    return Response.json({ ok: true });
  } catch (e) { return answerError(e); }
}
