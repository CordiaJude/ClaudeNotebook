import type { NextRequest } from "next/server";
import { getData } from "@/lib/data";
import { answerError, problem } from "@/lib/http";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
/** This person's chat for one document. */
export async function GET(req: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return problem("unauthenticated", "Sign in first.");
    const id = req.nextUrl.searchParams.get("artifactId") ?? "";
    return Response.json({ messages: await getData().messages(user.id, id) });
  } catch (e) { return answerError(e); }
}
