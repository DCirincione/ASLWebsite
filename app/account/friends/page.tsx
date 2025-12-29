import Link from "next/link";

import { AccountNav } from "@/components/account-nav";
import type { Friend } from "@/lib/supabase/types";

const fallbackFriends: Friend[] = [
  { id: "f1", name: "Jordan Lee", sport: "Basketball", skill_level: 9 },
  { id: "f2", name: "Sam Patel", sport: "Flag Football", skill_level: 7 },
  { id: "f3", name: "Morgan Diaz", sport: "Pickleball", skill_level: 6 },
];

export default function AccountFriendsPage() {
  return (
    <>
      <AccountNav />
      <div className="account-body shell">
        <header className="account-header">
          <div>
            <p className="eyebrow">Account</p>
            <h1>My Friends</h1>
            <p className="muted">Connect with teammates and opponents.</p>
        </div>
        <Link className="button ghost" href="/community">
          Find Friends
        </Link>
      </header>

      <section className="account-card">
        {fallbackFriends.length === 0 ? (
          <p className="muted">No friends yet. Connect with players in your leagues.</p>
        ) : (
          <ul className="list list--grid">
            {fallbackFriends.map((friend) => (
              <li key={friend.id}>
                <p className="list__title">{friend.name}</p>
                <p className="muted">
                  {friend.sport ?? "Sport"} · Skill {friend.skill_level ?? "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </>
  );
}
