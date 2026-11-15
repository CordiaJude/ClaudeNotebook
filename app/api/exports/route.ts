import type { NextRequest } from "next/server";
import { getData } from "@/lib/data";
import { docSchema } from "@/lib/doc/schema";
import { loadYDoc, readDoc } from "@/lib/doc/ydoc";
import { DOC_FORMATS, exportDoc, type DocFormat } from "@/lib/export";
import { answerError, problem } from "@/lib/http";
import { rooms } from "@/lib/rooms";
import { currentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Export a doc as Word, PDF or Markdown. Anyone who can open it can export it. The file is built from the live document, so it is never stale. */
export async function POST(req: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return problem("unauthenticated", "Sign in first.");
    const body = (await req.json().catch(() => null)) as { artifactId?: string; format?: string } | null;
    if (!body?.artifactId || !DOC_FORMATS.includes(body.format as DocFormat)) return problem("invalid", "Choose Word, PDF or Markdown.");
    const found = await getData().getArtifact(user.id, body.artifactId);
    if (!found) return problem("not_found", "That doc was not found, or it is not shared with you.");
    if (found.artifact.kind !== "doc" || !found.tabs[0]) return problem("invalid", "Export for slides is not built yet.");
    const state = await rooms().read(found.tabs[0].room);
    if (!state) return problem("not_found", "The document could not be opened.");
    const file = await exportDoc(readDoc(loadYDoc(state), docSchema()), body.format as DocFormat, found.artifact.title);
    return new Response(Buffer.from(file.bytes), {
      headers: { "Content-Type": file.mime, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`, "Cache-Control": "no-store", "X-Filename": encodeURIComponent(file.filename) },
    });
  } catch (e) { return answerError(e); }
}
