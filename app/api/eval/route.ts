import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { anthropicModel } from "@/lib/ai/anthropic";
import { EVAL_TOKEN_SHA256, SCENARIOS, runScenario, type Scenario } from "@/lib/ai/evals";
import { DEFAULT_MODEL } from "@/lib/ai/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Runs one live check of the AI against the real model and reports what happened. Never available on the public site:
    it exists so a private preview (where the model key lives) can prove the model contract in one request. It spends tokens. */
export async function GET(req: NextRequest) {
  if (process.env.VERCEL_ENV === "production") return new Response("Not found", { status: 404 });
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const given = createHash("sha256").update(token).digest(), want = Buffer.from(EVAL_TOKEN_SHA256, "hex");
  if (given.length !== want.length || !timingSafeEqual(given, want)) return new Response("Not found", { status: 404 });
  const scenario = req.nextUrl.searchParams.get("scenario") as Scenario;
  if (!SCENARIOS.includes(scenario)) return Response.json({ error: `scenario must be one of: ${SCENARIOS.join(", ")}` }, { status: 400 });
  const key = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: "No model key is set on this deployment (AI_API_KEY or ANTHROPIC_API_KEY)." }, { status: 503 });
  const report = await runScenario(anthropicModel({ apiKey: key, model: process.env.AI_MODEL || DEFAULT_MODEL }), scenario);
  return Response.json(report, { headers: { "Cache-Control": "no-store" } });
}
