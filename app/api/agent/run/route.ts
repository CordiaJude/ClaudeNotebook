import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { anthropicClient, liveblocks, liveblocksExtras, liveblocksRooms, supabaseBackend, supabaseLedger } from "@/lib/ai/server";
import { executeRun, HttpError, type RunRequest } from "@/lib/ai/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel caps function duration by plan; the loop stops itself at ~270s. Verify your plan's limit.
export const maxDuration = 300;

const json = (status: number, code: string, message: string) => NextResponse.json({ code, message }, { status });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return json(401, "unauthenticated", "Sign in first.");

  const body = (await req.json().catch(() => null)) as Partial<RunRequest> | null;
  if (!body || typeof body.message !== "string") return json(400, "bad_request", "Missing message.");

  const lb = liveblocks();
  if (!lb) return json(503, "ai_not_configured", "AI is not configured.");
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle();

  try {
    const stream = await executeRun(
      { notebookId: body.notebookId, tabId: body.tabId, trigger: body.trigger === "selection" ? "selection" : "panel", message: body.message, selection: body.selection, history: Array.isArray(body.history) ? body.history.slice(-10) : [] },
      {
        userId: auth.user.id, displayName: profile?.display_name ?? "Someone",
        client: anthropicClient(), rooms: liveblocksRooms(lb), backend: supabaseBackend(supabase, auth.user.id), ledger: supabaseLedger(),
        ...liveblocksExtras(lb), signal: req.signal,
      },
    );
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, e.code, e.message);
    return json(500, "run_failed", "Something went wrong.");
  }
}
