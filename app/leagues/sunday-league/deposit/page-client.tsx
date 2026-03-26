"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { HistoryBackButton } from "@/components/history-back-button";
import { PageShell } from "@/components/page-shell";
import { getSundayLeagueColor } from "@/lib/sunday-league";
import { supabase } from "@/lib/supabase/client";
import type { SundayLeagueTeam } from "@/lib/supabase/types";

type SundayLeagueDepositPageClientProps = {
  teamId: string | null;
};

export default function SundayLeagueDepositPageClient({ teamId }: SundayLeagueDepositPageClientProps) {
  const router = useRouter();
  const [team, setTeam] = useState<SundayLeagueTeam | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "no-session">("loading");

  useEffect(() => {
    const loadTeam = async () => {
      if (!supabase || !teamId) {
        setStatus("error");
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
        .select("*")
        .eq("id", teamId)
        .maybeSingle();

      if (error || !data) {
        setStatus("error");
        return;
      }

      const nextTeam = data as SundayLeagueTeam;
      if (nextTeam.user_id !== userId) {
        const { data: roleData } = await supabase
          .from("sunday_league_team_members")
          .select("id")
          .eq("team_id", nextTeam.id)
          .eq("player_user_id", userId)
          .eq("status", "accepted")
          .eq("role", "co_captain")
          .limit(1);

        if ((roleData ?? []).length === 0) {
          setStatus("error");
          return;
        }
      }

      setTeam(nextTeam);
      setStatus("ready");
    };

    void loadTeam();
  }, [teamId]);

  return (
    <PageShell>
      <section className="section sunday-league-flow-page">
        <div className="sunday-league-flow-card">
          <p className="eyebrow">Deposit Payment Page</p>
          <h1>Reserve Your Team Spot</h1>
          <p className="muted">
            A $100 deposit is required to hold your Sunday League slot. Connect your payment processor or hosted checkout link here when ready.
          </p>

          {status === "loading" ? <p className="muted">Loading team reservation...</p> : null}
          {status === "no-session" ? <p className="form-help error">Sign in to continue to your deposit page.</p> : null}
          {status === "error" ? <p className="form-help error">We could not load that team reservation.</p> : null}

          {team ? (
            <div className="sunday-league-flow-summary">
              <div className="sunday-league-flow-summary__card">
                <h2>{team.team_name}</h2>
                <p>Captain: {team.captain_name}</p>
                <p>Primary jersey: {getSundayLeagueColor(team.preferred_jersey_colors, "primary") || "TBD"}</p>
              </div>
              <div className="sunday-league-flow-summary__card">
                <h3>What happens next</h3>
                <p>1. Collect the $100 deposit.</p>
                <p>2. Confirm payment and any league requirements.</p>
                <p>3. Send the captain or co-captain into the roster portal.</p>
              </div>
            </div>
          ) : null}

          <div className="sunday-league-inline-actions">
            {team ? (
              <button className="button primary" type="button" onClick={() => router.push(`/leagues/sunday-league/team/${team.id}`)}>
                Continue to Your Sunday League Team
              </button>
            ) : null}
            <HistoryBackButton label="Back to League Hub" fallbackHref="/leagues/sunday-league" />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
