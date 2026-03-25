"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { HistoryBackButton } from "@/components/history-back-button";
import { PageShell } from "@/components/page-shell";
import { TeamLogoImage } from "@/components/team-logo-image";
import { supabase } from "@/lib/supabase/client";
import type { SundayLeagueTeam } from "@/lib/supabase/types";

const buildPublicRoster = (team: SundayLeagueTeam | null) => {
  const captainRow = team?.captain_is_playing ? `${team.captain_name} (Captain)` : null;
  return Array.from({ length: 10 }, (_, index) => {
    if (index === 0 && captainRow) return captainRow;
    return "Roster spot to be announced";
  });
};

const buildPublicSchedule = (team: SundayLeagueTeam | null) => {
  if (!team) return [];

  return [
    `Week 1: ${team.team_name} vs Opponent TBD`,
    `Week 2: Matchday assignment coming soon`,
    `Week 3: Schedule release pending division setup`,
  ];
};

export default function SundayLeaguePublicTeamPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;
  const [team, setTeam] = useState<SundayLeagueTeam | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const loadTeam = async () => {
      if (!supabase || !teamId) {
        setStatus("error");
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

      setTeam(data as SundayLeagueTeam);
      setStatus("ready");
    };

    void loadTeam();
  }, [teamId]);

  const rosterRows = useMemo(() => buildPublicRoster(team), [team]);
  const scheduleRows = useMemo(() => buildPublicSchedule(team), [team]);

  return (
    <PageShell>
      <section className="section sunday-league-flow-page">
        <div className="sunday-league-flow-card">
          <div className="sunday-league-inline-actions sunday-league-flow-card__back">
            <HistoryBackButton className="button primary" label="Back to Teams" fallbackHref="/leagues/sunday-league?section=teams" />
          </div>
          <div className="sunday-league-flow-card__heading">
            <p className="eyebrow">Sunday League Team</p>
            <h1>{team?.team_name ?? "Team Profile"}</h1>
          </div>

          {status === "loading" ? <p className="muted">Loading team page...</p> : null}
          {status === "error" ? <p className="form-help error">We could not load this team page.</p> : null}

          {team ? (
            <>
              <article className="sunday-league-flow-summary__card sunday-league-public-team-card">
                <div className="sunday-league-public-team-card__logo">
                  <TeamLogoImage src={team.team_logo_url} alt="" fill sizes="180px" />
                </div>
                <h2>{team.team_name}</h2>
              </article>

              <article className="sunday-league-flow-summary__card">
                <h3>Roster</h3>
                <div className="sunday-league-roster-list">
                  {rosterRows.map((player, index) => (
                    <div key={`${player}-${index}`} className="sunday-league-roster-row">
                      <span>Player {index + 1}</span>
                      <span>{player}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="sunday-league-flow-summary__card">
                <h3>Schedule</h3>
                <div className="sunday-league-roster-list">
                  {scheduleRows.map((item) => (
                    <div key={item} className="sunday-league-roster-row">
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </article>
            </>
          ) : null}

          <div className="sunday-league-inline-actions">
            <HistoryBackButton label="Back to League Hub" fallbackHref="/leagues/sunday-league" />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
