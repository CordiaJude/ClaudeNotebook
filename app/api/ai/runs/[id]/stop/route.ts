import type { NextRequest } from "next/server";
import { stopRun } from "@/lib/ai/run";
import { getData } from "@/lib/data";
import { answerError, problem } from "@/lib/http";
import { currentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stop a draft in progress. Only the person who started it can. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return problem("unauthenticated", "Sign in first.");
    const { id } = await params;
    return Response.json({ stopped: await stopRun(id, { user, data: getData() }) });
  } catch (e) { return answerError(e); }
}
