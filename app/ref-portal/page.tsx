"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { HistoryBackButton } from "@/components/history-back-button";
import { PageShell } from "@/components/page-shell";
import { canAccessRefPortal } from "@/lib/event-approval";
import { supabase } from "@/lib/supabase/client";
import type { Profile, SundayLeagueMatchup, SundayLeagueScheduleWeek, SundayLeagueTeam } from "@/lib/supabase/types";

import "./ref-portal.css";

type AccessStatus = "loading" | "allowed" | "forbidden" | "no-session";
type SaveStatus = { type: "idle" | "loading" | "success" | "error"; message?: string };
type SundayLeagueScheduleWeekWithMatchups = SundayLeagueScheduleWeek & {
  matchups: SundayLeagueMatchup[];
};
type ScoreDraft = {
  team_1_score: string;
  team_2_score: string;
  forfeited_team_id: string;
};

const SUNDAY_LEAGUE_FIELDS = ["Black Sheep Field", "Magic Fountain Field"] as const;

const getScoreDraft = (matchup: SundayLeagueMatchup): ScoreDraft => ({
  team_1_score: matchup.team_1_score == null ? "" : String(matchup.team_1_score),
  team_2_score: matchup.team_2_score == null ? "" : String(matchup.team_2_score),
  forfeited_team_id: matchup.forfeited_team_id ?? "",
});

const formatScore = (matchup: SundayLeagueMatchup) =>
  matchup.forfeited_team_id
    ? "Forfeit"
    : matchup.team_1_score == null || matchup.team_2_score == null
    ? "Not entered"
    : `${matchup.team_1_score} - ${matchup.team_2_score}`;

export default function RefPortalPage() {
  const [status, setStatus] = useState<AccessStatus>("loading");
  const [profile, setProfile] = useState<Pick<Profile, "id" | "name" | "role"> | null>(null);
  const [weeks, setWeeks] = useState<SundayLeagueScheduleWeekWithMatchups[]>([]);
  const [teams, setTeams] = useState<SundayLeagueTeam[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState("");
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, ScoreDraft>>({});
  const [scoreStatuses, setScoreStatuses] = useState<Record<string, SaveStatus>>({});

  const fetchWithSession = useCallback(async (input: string, init?: RequestInit) => {
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }

    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) {
      throw new Error("You need to be signed in.");
    }

    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${accessToken}`);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    return fetch(input, {
      ...init,
      headers,
    });
  }, []);

  const loadSchedule = useCallback(async () => {
    if (!supabase) return;

    setLoadingSchedule(true);
    setScheduleError(null);

    const [weeksResponse, matchupsResponse, teamsResponse] = await Promise.all([
      supabase.from("sunday_league_schedule_weeks").select("*").order("week_number", { ascending: true }),
      supabase.from("sunday_league_matchups").select("*").order("sort_order", { ascending: true }),
      supabase.from("sunday_league_teams").select("*").order("team_name", { ascending: true }),
    ]);

    setLoadingSchedule(false);

    if (weeksResponse.error || matchupsResponse.error || teamsResponse.error) {
      setScheduleError(
        weeksResponse.error?.message ??
          matchupsResponse.error?.message ??
          teamsResponse.error?.message ??
          "Could not load the schedule.",
      );
      return;
    }

    const matchups = (matchupsResponse.data ?? []) as SundayLeagueMatchup[];
    const matchupsByWeekId = new Map<string, SundayLeagueMatchup[]>();
    const nextScoreDrafts: Record<string, ScoreDraft> = {};

    for (const matchup of matchups) {
      matchupsByWeekId.set(matchup.week_id, [...(matchupsByWeekId.get(matchup.week_id) ?? []), matchup]);
      nextScoreDrafts[matchup.id] = getScoreDraft(matchup);
    }

    const nextWeeks = ((weeksResponse.data ?? []) as SundayLeagueScheduleWeek[])
      .map((week) => ({ ...week, matchups: matchupsByWeekId.get(week.id) ?? [] }))
      .filter((week) => week.matchups.length > 0);

    setWeeks(nextWeeks);
    setTeams((teamsResponse.data ?? []) as SundayLeagueTeam[]);
    setScoreDrafts(nextScoreDrafts);
    setSelectedWeekId((current) => (current && nextWeeks.some((week) => week.id === current) ? current : nextWeeks.at(-1)?.id ?? ""));
  }, []);

  useEffect(() => {
    const loadPage = async () => {
      if (!supabase) {
        setStatus("forbidden");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        setStatus("no-session");
        return;
      }

      const { data: profileData } = await supabase.from("profiles").select("id,name,role").eq("id", userId).maybeSingle();
      const nextProfile = (profileData as Pick<Profile, "id" | "name" | "role"> | null) ?? null;
      setProfile(nextProfile);

      if (!canAccessRefPortal(nextProfile?.role)) {
        setStatus("forbidden");
        return;
      }

      setStatus("allowed");
      await loadSchedule();
    };

    void loadPage();
  }, [loadSchedule]);

  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const selectedWeek = weeks.find((week) => week.id === selectedWeekId) ?? weeks.at(-1) ?? null;
  const selectedWeekMatchups = selectedWeek?.matchups ?? [];
  const completedCount = selectedWeekMatchups.filter(
    (matchup) => Boolean(matchup.forfeited_team_id) || (matchup.team_1_score != null && matchup.team_2_score != null),
  ).length;

  const getTeamLabel = (teamId?: string | null, fallback?: string | null) =>
    (teamId ? teamById.get(teamId)?.team_name : null) ?? fallback ?? "Team TBD";

  const updateDraft = (matchupId: string, key: "team_1_score" | "team_2_score", value: string) => {
    const cleaned = value.replace(/[^\d]/g, "");
    setScoreDrafts((prev) => ({
      ...prev,
      [matchupId]: {
        ...(prev[matchupId] ?? { team_1_score: "", team_2_score: "", forfeited_team_id: "" }),
        [key]: cleaned,
      },
    }));
  };

  const updateForfeitDraft = (matchupId: string, forfeitedTeamId: string) => {
    setScoreDrafts((prev) => ({
      ...prev,
      [matchupId]: {
        ...(prev[matchupId] ?? { team_1_score: "", team_2_score: "", forfeited_team_id: "" }),
        forfeited_team_id: forfeitedTeamId,
      },
    }));
  };

  const saveScore = async (event: FormEvent, matchup: SundayLeagueMatchup) => {
    event.preventDefault();
    const draft = scoreDrafts[matchup.id] ?? getScoreDraft(matchup);

    setScoreStatuses((prev) => ({ ...prev, [matchup.id]: { type: "loading" } }));

    try {
      const response = await fetchWithSession("/api/ref/scores", {
        method: "PATCH",
        body: JSON.stringify({
          matchupId: matchup.id,
          team_1_score: draft.team_1_score,
          team_2_score: draft.team_2_score,
          forfeited_team_id: draft.forfeited_team_id,
        }),
      });
      const json = (await response.json().catch(() => null)) as { error?: string; matchup?: SundayLeagueMatchup } | null;

      if (!response.ok || !json?.matchup) {
        throw new Error(json?.error ?? "Could not save this score.");
      }

      const updatedMatchup = json.matchup;
      setWeeks((prev) =>
        prev.map((week) => ({
          ...week,
          matchups: week.matchups.map((item) => (item.id === updatedMatchup.id ? updatedMatchup : item)),
        })),
      );
      setScoreDrafts((prev) => ({ ...prev, [updatedMatchup.id]: getScoreDraft(updatedMatchup) }));
      setScoreStatuses((prev) => ({ ...prev, [updatedMatchup.id]: { type: "success", message: "Score saved." } }));
    } catch (error) {
      setScoreStatuses((prev) => ({
        ...prev,
        [matchup.id]: {
          type: "error",
          message: error instanceof Error ? error.message : "Could not save this score.",
        },
      }));
    }
  };

  if (status === "loading") {
    return (
      <PageShell>
        <p className="muted">Loading ref portal...</p>
      </PageShell>
    );
  }

  if (status === "no-session") {
    return (
      <PageShell>
        <section className="ref-portal-access">
          <h1>Ref Portal</h1>
          <p className="muted">Sign in with a ref, admin, or owner account to enter Sunday League scores.</p>
          <Link className="button primary" href="/account/create">
            Sign In
          </Link>
        </section>
      </PageShell>
    );
  }

  if (status === "forbidden") {
    return (
      <PageShell>
        <section className="ref-portal-access">
          <HistoryBackButton label="← Back" fallbackHref="/account" />
          <h1>Ref Portal</h1>
          <p className="muted">Your account does not have ref portal access.</p>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="ref-portal">
        <HistoryBackButton label="← Back" fallbackHref="/account" />
        <section className="account-card account-card__summary ref-portal__hero">
          <div>
            <p className="eyebrow">Sunday League</p>
            <h1>Ref Portal</h1>
            <p className="muted">
              Enter final scores for posted weekly matchups. Saved scores show on the public schedule and team pages.
            </p>
          </div>
          <div className="ref-portal__identity">
            <span>{profile?.name ?? "Referee"}</span>
            <strong>{profile?.role ?? "ref"}</strong>
          </div>
        </section>

        <section className="account-card ref-portal__controls">
          <div className="form-control ref-portal__week-select">
            <label htmlFor="ref-week">Week</label>
            <div className="ref-portal__week-select-control">
              <select id="ref-week" value={selectedWeekId} onChange={(event) => setSelectedWeekId(event.target.value)}>
                {weeks.map((week) => (
                  <option key={week.id} value={week.id}>
                    Week {week.week_number}
                  </option>
                ))}
              </select>
              <span aria-hidden>v</span>
            </div>
          </div>
          <button className="button ghost" type="button" onClick={() => void loadSchedule()} disabled={loadingSchedule}>
            {loadingSchedule ? "Refreshing..." : "Refresh"}
          </button>
          {selectedWeek ? (
            <p className="muted">
              {completedCount} of {selectedWeekMatchups.length} score{selectedWeekMatchups.length === 1 ? "" : "s"} entered
            </p>
          ) : null}
        </section>

        {scheduleError ? <p className="form-help error">{scheduleError}</p> : null}
        {loadingSchedule ? <p className="muted">Loading schedule...</p> : null}
        {!loadingSchedule && weeks.length === 0 ? <p className="muted">No schedule weeks have been posted yet.</p> : null}

        {selectedWeek ? (
          <div className="ref-portal__week">
            {SUNDAY_LEAGUE_FIELDS.map((fieldName) => {
              const fieldMatchups = selectedWeek.matchups
                .filter((matchup) => matchup.field_name === fieldName)
                .sort((left, right) => left.sort_order - right.sort_order);

              return (
                <section key={fieldName} className="account-card ref-portal__field">
                  <div className="account-card__header">
                    <div>
                      <p className="eyebrow">Week {selectedWeek.week_number}</p>
                      <h2>{fieldName}</h2>
                    </div>
                    <span className="pill">{fieldMatchups.length} game{fieldMatchups.length === 1 ? "" : "s"}</span>
                  </div>
                  {fieldMatchups.length === 0 ? <p className="muted">No matchups posted for this field.</p> : null}
                  <div className="ref-portal__matchups">
                    {fieldMatchups.map((matchup) => {
                      const teamOneLabel = getTeamLabel(matchup.team_1_id, matchup.team_1_name);
                      const teamTwoLabel = getTeamLabel(matchup.team_2_id, matchup.team_2_name);
                      const draft = scoreDrafts[matchup.id] ?? getScoreDraft(matchup);
                      const saveStatus = scoreStatuses[matchup.id] ?? { type: "idle" };
                      const hasForfeit = Boolean(draft.forfeited_team_id);

                      return (
                        <form key={matchup.id} className="ref-portal__matchup" onSubmit={(event) => void saveScore(event, matchup)}>
                          <div className="ref-portal__matchup-main">
                            <span className="ref-portal__time">{matchup.start_time}</span>
                            <div>
                              <p className="ref-portal__teams">
                                {teamOneLabel} <span>vs</span> {teamTwoLabel}
                              </p>
                              <p className="muted">Current score: {formatScore(matchup)}</p>
                            </div>
                          </div>
                          <label className="ref-portal__forfeit">
                            <span>Forfeit</span>
                            <select
                              value={draft.forfeited_team_id}
                              onChange={(event) => updateForfeitDraft(matchup.id, event.target.value)}
                              aria-label="Forfeit team"
                            >
                              <option value="">No forfeit</option>
                              {matchup.team_1_id ? <option value={matchup.team_1_id}>{teamOneLabel} forfeited</option> : null}
                              {matchup.team_2_id ? <option value={matchup.team_2_id}>{teamTwoLabel} forfeited</option> : null}
                            </select>
                          </label>
                          <div className="ref-portal__score-grid">
                            <label>
                              <span>{teamOneLabel}</span>
                              <input
                                inputMode="numeric"
                                value={draft.team_1_score}
                                onChange={(event) => updateDraft(matchup.id, "team_1_score", event.target.value)}
                                placeholder="0"
                                disabled={hasForfeit}
                                aria-label={`${teamOneLabel} score`}
                              />
                            </label>
                            <label>
                              <span>{teamTwoLabel}</span>
                              <input
                                inputMode="numeric"
                                value={draft.team_2_score}
                                onChange={(event) => updateDraft(matchup.id, "team_2_score", event.target.value)}
                                placeholder="0"
                                disabled={hasForfeit}
                                aria-label={`${teamTwoLabel} score`}
                              />
                            </label>
                            <button className="button primary" type="submit" disabled={saveStatus.type === "loading"}>
                              {saveStatus.type === "loading" ? "Saving..." : "Save"}
                            </button>
                          </div>
                          {saveStatus.message ? (
                            <p className={`form-help ${saveStatus.type === "error" ? "error" : "muted"}`}>{saveStatus.message}</p>
                          ) : null}
                        </form>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
