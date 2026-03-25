"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AccessibilityControls } from "@/components/accessibility-controls";
import { AccountNav } from "@/components/account-nav";
import { TeamLogoImage } from "@/components/team-logo-image";
import { supabase } from "@/lib/supabase/client";
import type { SundayLeagueTeam } from "@/lib/supabase/types";

type AccountSundayLeagueTeam = Pick<SundayLeagueTeam, "id" | "team_name" | "team_logo_url">;

export default function AccountTeamPage() {
  const [teams, setTeams] = useState<AccountSundayLeagueTeam[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "no-session">("loading");

  useEffect(() => {
    const loadTeams = async () => {
      if (!supabase) {
        setTeams([]);
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
        .from("sunday_league_teams")
        .select("id,team_name,team_logo_url")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        setTeams([]);
        setStatus("ready");
        return;
      }

      setTeams((data ?? []) as AccountSundayLeagueTeam[]);
      setStatus("ready");
    };

    loadTeams();
  }, []);

  const list = teams ?? [];

  return (
    <>
      <AccessibilityControls />
      <AccountNav />
      <div className="account-body shell">
        <header className="account-header">
          <div>
            <p className="eyebrow">Account</p>
            <h1>Your Sunday League Team</h1>
            <p className="muted">Manage your Sunday League team and roster.</p>
          </div>
          <Link className="button primary" href="/leagues/sunday-league">
            Sunday League Hub
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
                    <TeamLogoImage src={team.team_logo_url} alt="" fill sizes="80px" />
                  </div>
                  <div className="team-card__info">
                    <p className="list__title">{team.team_name}</p>
                    <p className="muted">Sunday League team</p>
                  </div>
                  <Link className="button ghost" href={`/leagues/sunday-league/team/${team.id}`}>
                    Team Portal
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
