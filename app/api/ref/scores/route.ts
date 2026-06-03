import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedProfile, getSupabaseServiceRole } from "@/lib/admin-route-auth";
import { canAccessRefPortal } from "@/lib/event-approval";
import type {
  SundayLeagueLeaderboard,
  SundayLeagueLeaderboardInsert,
  SundayLeagueLeaderboardUpdate,
  SundayLeagueMatchup,
  SundayLeagueMatchupUpdate,
  SundayLeagueTeam,
} from "@/lib/supabase/types";

type SupabaseServiceClient = NonNullable<ReturnType<typeof getSupabaseServiceRole>>;

type LeaderboardAccumulator = Pick<
  SundayLeagueLeaderboard,
  "team_id" | "wins" | "draws" | "losses" | "goals_for" | "goals_against" | "forfeit_wins"
>;

const parseScore = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
};

const createEmptyLeaderboardRow = (teamId: string): LeaderboardAccumulator => ({
  team_id: teamId,
  wins: 0,
  draws: 0,
  losses: 0,
  goals_for: 0,
  goals_against: 0,
  forfeit_wins: 0,
});

const applyMatchResult = (
  row: LeaderboardAccumulator,
  goalsFor: number,
  goalsAgainst: number,
) => {
  row.goals_for += goalsFor;
  row.goals_against += goalsAgainst;

  if (goalsFor > goalsAgainst) {
    row.wins += 1;
  } else if (goalsFor < goalsAgainst) {
    row.losses += 1;
  } else {
    row.draws += 1;
  }
};

const applyForfeitResult = (winningRow: LeaderboardAccumulator, losingRow: LeaderboardAccumulator) => {
  winningRow.forfeit_wins += 1;
  losingRow.losses += 1;
};

const recalculateSundayLeagueLeaderboard = async (supabase: SupabaseServiceClient) => {
  const [teamsResponse, matchupsResponse, leaderboardResponse] = await Promise.all([
    supabase.from("sunday_league_teams").select("id"),
    supabase.from("sunday_league_matchups").select("*"),
    supabase.from("sunday_league_leaderboard").select("*"),
  ]);

  if (teamsResponse.error) throw teamsResponse.error;
  if (matchupsResponse.error) throw matchupsResponse.error;
  if (leaderboardResponse.error) throw leaderboardResponse.error;

  const teams = (teamsResponse.data ?? []) as Pick<SundayLeagueTeam, "id">[];
  const matchups = (matchupsResponse.data ?? []) as SundayLeagueMatchup[];
  const existingRows = (leaderboardResponse.data ?? []) as SundayLeagueLeaderboard[];
  const leaderboardByTeamId = new Map<string, LeaderboardAccumulator>();

  for (const team of teams) {
    leaderboardByTeamId.set(team.id, createEmptyLeaderboardRow(team.id));
  }

  for (const matchup of matchups) {
    if (!matchup.team_1_id || !matchup.team_2_id) continue;

    const teamOneRow = leaderboardByTeamId.get(matchup.team_1_id);
    const teamTwoRow = leaderboardByTeamId.get(matchup.team_2_id);
    if (!teamOneRow || !teamTwoRow) continue;

    if (matchup.forfeited_team_id) {
      if (matchup.forfeited_team_id === matchup.team_1_id) {
        applyForfeitResult(teamTwoRow, teamOneRow);
      } else if (matchup.forfeited_team_id === matchup.team_2_id) {
        applyForfeitResult(teamOneRow, teamTwoRow);
      }
      continue;
    }

    if (matchup.team_1_score == null || matchup.team_2_score == null) continue;

    applyMatchResult(teamOneRow, matchup.team_1_score, matchup.team_2_score);
    applyMatchResult(teamTwoRow, matchup.team_2_score, matchup.team_1_score);
  }

  const now = new Date().toISOString();
  const existingRowByTeamId = new Map(existingRows.map((row) => [row.team_id, row]));
  const inserts: SundayLeagueLeaderboardInsert[] = [];
  const updates: Array<SundayLeagueLeaderboardUpdate & { id: string }> = [];

  for (const row of leaderboardByTeamId.values()) {
    const existingRow = existingRowByTeamId.get(row.team_id);
    const payload = {
      team_id: row.team_id,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
      goals_for: row.goals_for,
      goals_against: row.goals_against,
      forfeit_wins: row.forfeit_wins,
      updated_at: now,
    };

    if (existingRow) {
      updates.push({ id: existingRow.id, ...payload });
    } else {
      inserts.push({ ...payload, created_at: now });
    }
  }

  for (const update of updates) {
    const { id, ...payload } = update;
    const { error } = await supabase.from("sunday_league_leaderboard").update(payload).eq("id", id);
    if (error) throw error;
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("sunday_league_leaderboard").insert(inserts);
    if (error) throw error;
  }
};

export async function PATCH(req: NextRequest) {
  const profile = await getAuthenticatedProfile(req);
  if (!profile) {
    return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
  }

  if (!canAccessRefPortal(profile.role)) {
    return NextResponse.json({ error: "You do not have access to the ref portal." }, { status: 403 });
  }

  const supabase = getSupabaseServiceRole();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        matchupId?: unknown;
        team_1_score?: unknown;
        team_2_score?: unknown;
        forfeited_team_id?: unknown;
      }
    | null;

  const matchupId = typeof body?.matchupId === "string" ? body.matchupId.trim() : "";
  const teamOneScore = parseScore(body?.team_1_score);
  const teamTwoScore = parseScore(body?.team_2_score);
  const forfeitedTeamId =
    typeof body?.forfeited_team_id === "string" ? body.forfeited_team_id.trim() || null : null;

  if (!matchupId) {
    return NextResponse.json({ error: "Missing matchup ID." }, { status: 400 });
  }

  if (teamOneScore === undefined || teamTwoScore === undefined) {
    return NextResponse.json({ error: "Scores must be blank or nonnegative whole numbers." }, { status: 400 });
  }

  const { data: existingMatchup, error: existingMatchupError } = await supabase
    .from("sunday_league_matchups")
    .select("*")
    .eq("id", matchupId)
    .single();

  if (existingMatchupError || !existingMatchup) {
    return NextResponse.json({ error: existingMatchupError?.message ?? "Could not find this matchup." }, { status: 404 });
  }

  if (
    forfeitedTeamId &&
    (forfeitedTeamId !== existingMatchup.team_1_id || !existingMatchup.team_1_id) &&
    (forfeitedTeamId !== existingMatchup.team_2_id || !existingMatchup.team_2_id)
  ) {
    return NextResponse.json({ error: "Forfeit team must be one of the registered matchup teams." }, { status: 400 });
  }

  const update: SundayLeagueMatchupUpdate = {
    team_1_score: forfeitedTeamId ? null : teamOneScore,
    team_2_score: forfeitedTeamId ? null : teamTwoScore,
    forfeited_team_id: forfeitedTeamId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("sunday_league_matchups")
    .update(update)
    .eq("id", matchupId)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not save the score." }, { status: 500 });
  }

  try {
    await recalculateSundayLeagueLeaderboard(supabase);
  } catch (leaderboardError) {
    return NextResponse.json(
      {
        error:
          leaderboardError instanceof Error
            ? `Score saved, but the leaderboard could not be recalculated: ${leaderboardError.message}`
            : "Score saved, but the leaderboard could not be recalculated.",
        matchup: data,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ matchup: data });
}
