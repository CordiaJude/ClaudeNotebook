import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Presenter } from "@/components/deck/Presenter";
import { BRAND } from "@/lib/brand";
import { getData } from "@/lib/data";
import { loadDeck } from "@/lib/deck/ydeck";
import { rooms } from "@/lib/rooms";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Presenting · ${BRAND.name}` };

/** S08: present a deck. Anyone who can open the deck can present it. */
export default async function Present({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ slide?: string }> }) {
  const { id } = await params;
  const { slide } = await searchParams;
  const user = await requireUser(`/a/${id}/present`);
  const found = await getData().getArtifact(user.id, id);
  if (!found) notFound();
  if (found.artifact.kind !== "deck" || !found.tabs[0]) redirect(`/a/${id}`);
  const state = await rooms().read(found.tabs[0].room);
  if (!state) notFound();
  const design = await getData().getDesign(user.id, id);
  return <Presenter deck={loadDeck(state).deck} design={design} backHref={`/a/${id}`} start={Math.max(0, (Number(slide) || 1) - 1)} />;
}
