import { AppHeader } from "@/components/library/AppHeader";
import { Soon } from "@/components/library/Soon";
import { IconPalette } from "@/components/ui/icons";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export default async function DesignSystemSettings() {
  const user = await requireUser("/settings/design-system");
  return <><AppHeader user={user} /><Soon id="S11" milestone="Slides milestone" title="Design system" icon={<IconPalette />} body="Set the colours and fonts every deck follows, or build them from a brand deck you upload." /></>;
}
