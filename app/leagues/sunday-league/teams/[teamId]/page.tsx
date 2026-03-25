"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { HistoryBackButton } from "@/components/history-back-button";
import { PageShell } from "@/components/page-shell";
import { TeamLogoImage } from "@/components/team-logo-image";
import { getSundayLeagueDivisionLogoSrc, type SundayLeagueDivision } from "@/lib/sunday-league";
import { supabase } from "@/lib/supabase/client";
import type { SundayLeagueTeam } from "@/lib/supabase/types";

type TeamRosterPlayer = {
  id: string;
  name: string;
  position: string | null;
  avatarUrl: string | null;
  countryCode: string | null;
  jerseyNumber: string | null;
};

const buildPublicSchedule = (team: SundayLeagueTeam | null) => {
  if (!team) return [];

  return [
    `Week 1: ${team.team_name} vs Opponent TBD`,
    `Week 2: Matchday assignment coming soon`,
    `Week 3: Schedule release pending division setup`,
  ];
};

const buildTeamHistory = (team: SundayLeagueTeam | null) => {
  if (!team) return [];

  return [
    `${team.division ?? "Division placement pending"} reserved for the upcoming season`,
    team.deposit_status === "paid" ? "Deposit received and team spot confirmed" : "Deposit pending before final approval",
    "Club history will expand after the first official league match",
  ];
};

const getEstablishedLabel = (team: SundayLeagueTeam | null) => {
  const raw = typeof team?.created_at === "string" ? team.created_at : "";
  const year = raw.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : "2026";
};

const normalizeCountryCode = (value?: string | null) => {
  const normalized = (value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  if (/^[A-Z]{2}$/.test(normalized)) return normalized;

  const callingCodeMap: Record<string, string> = {
    "+1": "US",
    "1": "US",
    "+44": "GB",
    "44": "GB",
    "+52": "MX",
    "52": "MX",
    "+61": "AU",
    "61": "AU",
  };

  return callingCodeMap[normalized] ?? null;
};

const countryCodeToFlag = (value?: string | null) => {
  const normalized = normalizeCountryCode(value);
  if (!normalized) return null;
  return String.fromCodePoint(...Array.from(normalized).map((char) => 127397 + char.charCodeAt(0)));
};

export default function SundayLeaguePublicTeamPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;
  const [team, setTeam] = useState<SundayLeagueTeam | null>(null);
  const [rosterPlayers, setRosterPlayers] = useState<TeamRosterPlayer[]>([]);
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

      const nextTeam = data as SundayLeagueTeam;
      setTeam(nextTeam);

      if (!nextTeam.captain_is_playing) {
        setRosterPlayers([]);
        setStatus("ready");
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("id,name,avatar_url,country_code,positions")
        .eq("id", nextTeam.user_id)
        .maybeSingle();

      setRosterPlayers([
        {
          id: nextTeam.user_id,
          name: profileData?.name?.trim() || nextTeam.captain_name,
          position: Array.isArray(profileData?.positions) ? profileData.positions[0] ?? null : null,
          avatarUrl: profileData?.avatar_url ?? null,
          countryCode: profileData?.country_code?.trim()?.toUpperCase() ?? null,
          jerseyNumber: nextTeam.jersey_numbers?.[0]?.trim() || null,
        },
      ]);
      setStatus("ready");
    };

    void loadTeam();
  }, [teamId]);

  const scheduleRows = useMemo(() => buildPublicSchedule(team), [team]);
  const historyRows = useMemo(() => buildTeamHistory(team), [team]);
  const establishedLabel = useMemo(() => getEstablishedLabel(team), [team]);

  return (
    <PageShell>
      <section className="section sunday-league-flow-page">
        <div className="sunday-league-team-page">
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
              <article className="sunday-league-team-board">
                <div className="sunday-league-team-board__hero">
                  <div className="sunday-league-team-board__identity">
                    <div className="sunday-league-team-board__title-row">
                      <h2>{team.team_name}</h2>
                    </div>
                    <p className="sunday-league-team-board__captain">Captain: {team.captain_name}</p>
                  </div>
                  <div className="sunday-league-team-board__logo">
                    <TeamLogoImage src={team.team_logo_url} alt="" fill sizes="220px" />
                  </div>
                </div>

                <p className="sunday-league-team-board__established">Established {establishedLabel}</p>
                <div className="sunday-league-team-board__record">
                  <span>W 0</span>
                  <span>-</span>
                  <span>D 0</span>
                  <span>-</span>
                  <span>L 0</span>
                </div>

                <section className="sunday-league-team-board__section">
                  <h3>Roster</h3>
                  {rosterPlayers.length > 0 ? (
                    <div className="sunday-league-team-board__roster">
                      {rosterPlayers.map((player) => (
                        <article key={player.id} className="sunday-league-team-board__player-card">
                          <div className="sunday-league-team-board__player-avatar-wrap">
                            <div className="sunday-league-team-board__player-avatar">
                              <Image
                                src={player.avatarUrl ?? "/avatar-placeholder.svg"}
                                alt={player.name}
                                fill
                                sizes="180px"
                              />
                            </div>
                          </div>
                          <div className="sunday-league-team-board__player-panel">
                            <p className="sunday-league-team-board__player-name">
                              {player.name} - {player.position ?? "Player"}
                            </p>
                            <div className="sunday-league-team-board__player-row">
                              {countryCodeToFlag(player.countryCode) ? (
                                <p className="sunday-league-team-board__player-flag" aria-label={normalizeCountryCode(player.countryCode) ?? undefined}>
                                  {countryCodeToFlag(player.countryCode)}
                                </p>
                              ) : (
                                <span className="sunday-league-team-board__player-flag sunday-league-team-board__player-flag--empty" aria-hidden />
                              )}
                              <p className="sunday-league-team-board__player-number">#{player.jerseyNumber || "0"}</p>
                              <div className="sunday-league-team-board__player-badge">
                                <TeamLogoImage src={team.team_logo_url} alt="" fill sizes="42px" />
                              </div>
                            </div>
                            <div className="sunday-league-team-board__player-division">
                              <Image
                                src={getSundayLeagueDivisionLogoSrc(team.division as SundayLeagueDivision)}
                                alt={`Division ${team.division}`}
                                width={144}
                                height={42}
                                className="sunday-league-team-board__player-division-image"
                              />
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">No players have signed up for this roster yet.</p>
                  )}
                </section>

                <section className="sunday-league-team-board__section">
                  <h3>Schedule</h3>
                  <div className="sunday-league-team-board__list">
                    {scheduleRows.map((item) => (
                      <div key={item} className="sunday-league-team-board__list-row">
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="sunday-league-team-board__section">
                  <h3>History</h3>
                  <div className="sunday-league-team-board__list">
                    {historyRows.map((item) => (
                      <div key={item} className="sunday-league-team-board__list-row">
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </article>
            </>
          ) : null}
        </div>
      </section>
    </PageShell>
  );
}
