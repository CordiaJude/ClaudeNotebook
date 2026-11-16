import type { NextRequest } from "next/server";
import { getData } from "@/lib/data";
import { docSchema } from "@/lib/doc/schema";
import { loadYDoc, readDoc } from "@/lib/doc/ydoc";
import { loadDeck } from "@/lib/deck/ydeck";
import { DECK_FORMATS, DOC_FORMATS, exportDeck, exportDoc, type DeckFormat, type DocFormat } from "@/lib/export";
import { answerError, problem } from "@/lib/http";
import { rooms } from "@/lib/rooms";
import { currentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Export a doc as Word, PDF or Markdown, or a deck as PowerPoint, PDF or a web page. Anyone who can open it can export it. The file is built from the live document, so it is never stale. */
export async function POST(req: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return problem("unauthenticated", "Sign in first.");
    const body = (await req.json().catch(() => null)) as { artifactId?: string; format?: string } | null;
    if (!body?.artifactId || typeof body.format !== "string") return problem("invalid", "Choose a format.");
    const found = await getData().getArtifact(user.id, body.artifactId);
    if (!found || !found.tabs[0]) return problem("not_found", "That doc was not found, or it is not shared with you.");
    const deck = found.artifact.kind === "deck";
    if (deck ? !DECK_FORMATS.includes(body.format as DeckFormat) : !DOC_FORMATS.includes(body.format as DocFormat)) return problem("invalid", deck ? "Choose PowerPoint, PDF or web page." : "Choose Word, PDF or Markdown.");
    const state = await rooms().read(found.tabs[0].room);
    if (!state) return problem("not_found", "The document could not be opened.");
    const file = deck
      ? await exportDeck(loadDeck(state).deck, await getData().getDesign(user.id, body.artifactId), body.format as DeckFormat, found.artifact.title)
      : await exportDoc(readDoc(loadYDoc(state), docSchema()), body.format as DocFormat, found.artifact.title);
    return new Response(Buffer.from(file.bytes), {
      headers: { "Content-Type": file.mime, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`, "Cache-Control": "no-store", "X-Filename": encodeURIComponent(file.filename) },
    });
  } catch (e) { return answerError(e); }
}
