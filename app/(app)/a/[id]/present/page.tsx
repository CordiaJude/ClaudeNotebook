import { notFound } from "next/navigation";
import { Soon } from "@/components/library/Soon";
import { IconPlay } from "@/components/ui/icons";
import { getData } from "@/lib/data";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export default async function Present({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/a/${id}/present`);
  if (!(await getData().getArtifact(user.id, id))) notFound();
  return <Soon id="S08" milestone="Slides milestone" title="Present" icon={<IconPlay />} body="Full-screen presenting with next, previous and speaker notes." />;
}
