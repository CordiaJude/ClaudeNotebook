import type { Metadata } from "next";
import { DesignForm } from "@/components/deck/DesignForm";
import { AppHeader } from "@/components/library/AppHeader";
import { BRAND } from "@/lib/brand";
import { getData } from "@/lib/data";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Design system · ${BRAND.name}` };

/** S11: the colours and fonts every deck you own follows. */
export default async function DesignSystemSettings() {
  const user = await requireUser("/settings/design-system");
  const design = await getData().getDesign(user.id);
  return (
    <>
      <AppHeader user={user} />
      <main className="ui-ds">
        <header>
          <h1 className="ui-h1" style={{ margin: 0 }}>Design system</h1>
          <p className="ui-caption" style={{ margin: "6px 0 0", maxWidth: 640 }}>The colours and fonts every deck you own follows. Slides name roles such as “accent” and “heading”, so a change here restyles all of your decks at once, for everyone who opens them.</p>
        </header>
        <DesignForm initial={design} />
      </main>
    </>
  );
}
