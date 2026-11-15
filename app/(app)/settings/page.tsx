import { AppHeader } from "@/components/library/AppHeader";
import { Soon } from "@/components/library/Soon";
import { IconPeople } from "@/components/ui/icons";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export default async function Settings() {
  const user = await requireUser("/settings");
  return <><AppHeader user={user} /><Soon id="S14" milestone="after the must-haves" title="Account and billing" icon={<IconPeople />} body={`You are signed in as ${user.email}. Your profile, plan and usage are shown here once billing is built.`} /></>;
}
