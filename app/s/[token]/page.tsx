import { Soon } from "@/components/library/Soon";
import { IconLink } from "@/components/ui/icons";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
/** S12: a shared link. Visitors must sign in first; the link itself is honoured once sharing is built. */
export default async function SharedLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await requireUser(`/s/${token}`);
  return <Soon id="S12" milestone="Docs MVP milestone" title="Shared link" icon={<IconLink />} body="Opening a shared link gives you the access its owner chose. Share links are built with the share dialog." />;
}
