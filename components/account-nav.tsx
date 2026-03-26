import { HistoryBackButton } from "@/components/history-back-button";
import Link from "next/link";

export function AccountNav() {
  return (
    <nav className="account-nav shell" aria-label="Account navigation">
      <HistoryBackButton label="← Back" fallbackHref="/account" />
      <div className="account-nav__links">
        <Link href="/account#profile">Profile</Link>
        <Link href="/account#events">My Events</Link>
        <Link href="/account/settings">Settings</Link>
        <Link href="/account/team">My Team</Link>
        <Link href="/account/friends">My Friends</Link>
        <Link href="/events">Browse Events</Link>
      </div>
    </nav>
  );
}
