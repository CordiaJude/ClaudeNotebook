import type { NextRequest } from "next/server";
import { getModel } from "@/lib/ai/model";
import { runSelectionEdit, startChatRun } from "@/lib/ai/run";
import { getData } from "@/lib/data";
import { answerError, problem } from "@/lib/http";
import { rooms } from "@/lib/rooms";
import { currentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** One AI request. mode "chat" streams events; mode "selection" answers once. Both run as the signed-in person, with their role. */
export async function POST(req: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return problem("unauthenticated", "Sign in first.");
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.artifactId !== "string") return problem("invalid", "Missing document.");
    const deps = { user, data: getData(), rooms: rooms(), model: getModel(), signal: req.signal };
    if (body.mode === "selection") {
      const res = await runSelectionEdit({ artifactId: body.artifactId, scope: body.scope as never, instruction: String(body.instruction ?? "") }, deps);
      return Response.json(res, { status: res.ok ? 200 : 422 });
    }
    const stream = await startChatRun({ artifactId: body.artifactId, message: typeof body.message === "string" ? body.message : undefined, answers: body.answers as never }, deps);
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
  } catch (e) { return answerError(e); }
}
