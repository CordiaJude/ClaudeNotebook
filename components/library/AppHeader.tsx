import Link from "next/link";
import { signOut } from "@/app/actions";
import { Wordmark } from "@/components/brand/Mark";
import { Avatar } from "@/components/ui/misc";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { User } from "@/lib/data/types";

/** The top bar on every signed-in page outside the workspace. */
export function AppHeader({ user }: { user: User }) {
  return (
    <header className="ui-app-top">
      <Link href="/library" style={{ color: "inherit", textDecoration: "none" }}><Wordmark /></Link>
      <nav aria-label="Main" className="ui-app-nav">
        <Link href="/library">Library</Link>
        <Link href="/settings/design-system">Design system</Link>
        <Link href="/settings">Account</Link>
      </nav>
      <span style={{ flex: 1 }} />
      <ThemeToggle />
      <span className="ui-app-user"><Avatar name={user.name} /><span className="ui-ws-wide">{user.name}</span></span>
      <form action={signOut}><button className="ui-btn ui-btn--ghost ui-btn--sm" type="submit">Sign out</button></form>
    </header>
  );
}
