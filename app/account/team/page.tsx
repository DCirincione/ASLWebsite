"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AccountNav } from "@/components/account-nav";
import { supabase } from "@/lib/supabase/client";
import type { TeamMembership } from "@/lib/supabase/types";

const fallbackTeams: TeamMembership[] = [
  { id: "t1", team_name: "Downtown Warriors", role: "Captain", logo_url: null },
  { id: "t2", team_name: "City League All-Stars", role: "Player", logo_url: null },
];

const logoSrc = (logo?: string | null) => logo ?? "/team-placeholder.svg";

export default function AccountTeamPage() {
  const [teams, setTeams] = useState<TeamMembership[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "no-session">("loading");

  useEffect(() => {
    const loadTeams = async () => {
      if (!supabase) {
        setTeams(fallbackTeams);
        setStatus("ready");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;

      if (!userId) {
        setStatus("no-session");
        return;
      }

      const { data, error } = await supabase
        .from("team_memberships")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        setTeams(fallbackTeams);
        setStatus("ready");
        return;
      }

      setTeams(data ?? []);
      setStatus("ready");
    };

    loadTeams();
  }, []);

  const list = teams ?? [];

  return (
    <>
      <AccountNav />
      <div className="account-body shell">
        <header className="account-header">
          <div>
            <p className="eyebrow">Account</p>
            <h1>My Team</h1>
            <p className="muted">Manage your teams and roster.</p>
          </div>
          <Link className="button primary" href="/register">
            Create / Join
          </Link>
        </header>

        <section className="account-card">
          {status === "loading" ? (
            <p className="muted">Loading your teams...</p>
          ) : status === "no-session" ? (
            <p className="muted">Sign in to view your teams.</p>
          ) : list.length === 0 ? (
            <p className="muted">No teams yet. Register or join a team to get started.</p>
          ) : (
            <ul className="list list--grid">
              {list.map((team) => (
                <li key={team.id} className="team-card">
                  <div className="team-card__logo">
                    <Image src={logoSrc(team.logo_url)} alt="" fill sizes="80px" />
                  </div>
                  <div className="team-card__info">
                    <p className="list__title">{team.team_name}</p>
                    <p className="muted">{team.role ?? "Player"}</p>
                  </div>
                  <Link className="button ghost" href="/leagues">
                    View Schedule
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
