import type { NextRequest } from "next/server";
import { undoRun } from "@/lib/ai/run";
import { getData } from "@/lib/data";
import { answerError, problem } from "@/lib/http";
import { rooms } from "@/lib/rooms";
import { currentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Put back what one AI request changed. 409 with the conflicting text when a person edited the same blocks since. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return problem("unauthenticated", "Sign in first.");
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { force?: boolean };
    const res = await undoRun(id, body.force === true, { user, data: getData(), rooms: rooms() });
    return Response.json(res, { status: res.ok ? 200 : 409 });
  } catch (e) { return answerError(e); }
}
