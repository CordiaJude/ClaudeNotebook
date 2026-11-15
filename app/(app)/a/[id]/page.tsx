import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace/Workspace";
import { getModel } from "@/lib/ai/model";
import { BRAND } from "@/lib/brand";
import { getData } from "@/lib/data";
import { flushMirrors } from "@/lib/rooms";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ prompt?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await requireUser(`/a/${id}`);
  const found = await getData().getArtifact(user.id, id);
  return { title: `${found?.artifact.title ?? "Not found"} · ${BRAND.name}` };
}

/** S04: the workspace. Anyone with a role can open it; what they can do in it follows from that role. */
export default async function WorkspacePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { prompt } = await searchParams;
  const user = await requireUser(`/a/${id}`);
  await flushMirrors();
  const found = await getData().getArtifact(user.id, id);
  if (!found) notFound();
  const messages = await getData().messages(user.id, id);
  return <Workspace artifact={found.artifact} tab={found.tabs[0] ?? null} messages={messages} demo={getModel().demo} firstPrompt={prompt?.slice(0, 8000)} me={user} />;
}
