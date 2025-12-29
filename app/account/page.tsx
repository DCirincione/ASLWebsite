 "use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { AccountNav } from "@/components/account-nav";
import { supabase } from "@/lib/supabase/client";
import type { Friend, Profile, TeamMembership } from "@/lib/supabase/types";

type ProfileData = Profile & {
  team_memberships: TeamMembership[];
  friends: Friend[];
};

const fallbackProfile: ProfileData = {
  id: "demo",
  name: "Alex Johnson",
  age: 24,
  avatar_url: null,
  positions: ["Forward", "Wing"],
  skill_level: 8,
  sports: ["Basketball", "Flag Football"],
  about:
    "Community player focused on team play and sportsmanship. Loves weekend tournaments and pickup games.",
  height_cm: null,
  weight_lbs: null,
  team_memberships: [
    { id: "t1", team_name: "Downtown Warriors", role: "Captain" },
    { id: "t2", team_name: "City League All-Stars", role: "Player" },
  ],
  friends: [
    { id: "f1", name: "Jordan Lee", sport: "Basketball", skill_level: 9 },
    { id: "f2", name: "Sam Patel", sport: "Flag Football", skill_level: 7 },
    { id: "f3", name: "Morgan Diaz", sport: "Pickleball", skill_level: 6 },
  ],
};

function Stat({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="stat">
      <p className="stat__label">{label}</p>
      <p className="stat__value">{value ?? "—"}</p>
    </div>
  );
}

export default function AccountPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "no-session">("loading");
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (!supabase) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    setProfile(null);
    setStatus("no-session");
    setSigningOut(false);
  };

  useEffect(() => {
    const load = async () => {
      if (!supabase) {
        setProfile(fallbackProfile);
        setStatus("ready");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;

      if (!userId) {
        setStatus("no-session");
        return;
      }

      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

      if (error || !data) {
        setProfile(fallbackProfile);
        setStatus("ready");
        return;
      }

      setProfile({
        ...data,
        team_memberships: [],
        friends: [],
      });
      setStatus("ready");
    };

    load();
  }, []);

  if (status === "loading") {
    return (
      <div className="account-page">
        <AccountNav />
        <div className="account-body shell">
          <p className="muted">Loading your account...</p>
        </div>
      </div>
    );
  }

  if (status === "no-session") {
    return (
      <div className="account-page">
        <AccountNav />
        <div className="account-body shell">
          <p className="muted">Sign in to view your account.</p>
        </div>
      </div>
    );
  }

  const data = profile ?? fallbackProfile;
  const avatarSrc = data.avatar_url ?? "/avatar-placeholder.svg";

  return (
    <div className="account-page">
      <AccountNav />
      <div className="account-body shell">
        <header className="account-header">
          <div className="account-header__info">
            <div className="account-avatar" aria-hidden>
              <Image src={avatarSrc} alt="" fill sizes="96px" />
            </div>
            <div className="account-header__text">
              <p className="eyebrow">Account</p>
              <h1>{data.name}</h1>
              <p className="muted">Manage your profile, teams, and friends.</p>
            </div>
          </div>
          <button className="button ghost" type="button" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </header>

        <section className="account-card" id="profile">
          <h2>Profile</h2>
          <p className="muted">{data.about}</p>
          <div className="profile-grid">
            <Stat label="Age" value={data.age} />
            <Stat label="Skill (1-10)" value={data.skill_level} />
            <Stat label="Positions" value={data.positions?.join(", ") ?? "—"} />
            <Stat label="Sports" value={data.sports?.join(", ") ?? "—"} />
          </div>
        </section>
      </div>
    </div>
  );
}
