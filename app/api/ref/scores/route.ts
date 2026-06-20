import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedProfile, getSupabaseServiceRole } from "@/lib/admin-route-auth";
import { canAccessRefPortal } from "@/lib/event-approval";
import type {
  SundayLeagueLeaderboard,
  SundayLeagueLeaderboardInsert,
  SundayLeagueLeaderboardUpdate,
  SundayLeagueMatchup,
  SundayLeagueMatchupGoal,
  SundayLeagueMatchupGoalInsert,
  SundayLeagueMatchupUpdate,
  SundayLeagueTeam,
  SundayLeagueTeamMember,
} from "@/lib/supabase/types";

type SupabaseServiceClient = NonNullable<ReturnType<typeof getSupabaseServiceRole>>;

type LeaderboardAccumulator = Pick<
  SundayLeagueLeaderboard,
  "team_id" | "wins" | "draws" | "losses" | "goals_for" | "goals_against" | "forfeit_wins"
>;

type GoalScorerInput = {
  playerId: string;
  playerName: string;
  goalNumber: number;
};

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

const parseScorers = (value: unknown) => {
  if (!Array.isArray(value)) return undefined;

  const scorers: GoalScorerInput[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item === "string") {
      const playerId = item.trim();
      if (playerId) scorers.push({ playerId, playerName: "", goalNumber: index + 1 });
      continue;
    }

    if (!item || typeof item !== "object") return undefined;
    const entry = item as { playerId?: unknown; playerName?: unknown };
    const playerId = typeof entry.playerId === "string" ? entry.playerId.trim() : "";
    const playerName = typeof entry.playerName === "string" ? entry.playerName.trim() : "";
    if (playerName.length > 100) return undefined;
    if (playerId || playerName) scorers.push({ playerId, playerName, goalNumber: index + 1 });
  }

  return scorers;
};

const getRosterPlayersByProfileId = async (supabase: SupabaseServiceClient, team: SundayLeagueTeam) => {
  const { data: membersData, error: membersError } = await supabase
    .from("sunday_league_team_members")
    .select("*")
    .eq("team_id", team.id)
    .eq("status", "accepted")
    .order("created_at", { ascending: true });

  if (membersError) throw membersError;

  const members = (membersData ?? []) as SundayLeagueTeamMember[];
  const profileIds = new Set<string>();
  if (team.captain_is_playing) {
    profileIds.add(team.user_id);
  }
  for (const member of members) {
    if (member.player_user_id) {
      profileIds.add(member.player_user_id);
    }
  }

  const namesByProfileId = new Map<string, string>();
  if (profileIds.size > 0) {
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id,name")
      .in("id", Array.from(profileIds));

    if (profilesError) throw profilesError;

    for (const profile of (profilesData ?? []) as Array<{ id: string; name: string | null }>) {
      namesByProfileId.set(profile.id, profile.name?.trim() || "Player");
    }
  }

  const rosterByProfileId = new Map<string, string>();
  if (team.captain_is_playing) {
    rosterByProfileId.set(team.user_id, namesByProfileId.get(team.user_id) || team.captain_name);
  }

  for (const member of members) {
    if (!member.player_user_id || member.player_user_id === team.user_id) continue;
    rosterByProfileId.set(
      member.player_user_id,
      namesByProfileId.get(member.player_user_id) || member.invite_name?.trim() || "Player",
    );
  }

  return rosterByProfileId;
};

const buildGoalRows = (
  matchupId: string,
  teamId: string,
  scorers: GoalScorerInput[],
  rosterByProfileId: Map<string, string>,
) =>
  scorers.map((scorer): SundayLeagueMatchupGoalInsert => {
    if (scorer.playerId) {
      const linkedPlayerName = rosterByProfileId.get(scorer.playerId);
      if (!linkedPlayerName) {
        throw new Error("Each linked scorer must be on that team's accepted roster.");
      }

      return {
        matchup_id: matchupId,
        team_id: teamId,
        player_user_id: scorer.playerId,
        player_name: linkedPlayerName,
        goal_number: scorer.goalNumber,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    return {
      matchup_id: matchupId,
      team_id: teamId,
      player_user_id: null,
      player_name: scorer.playerName,
      goal_number: scorer.goalNumber,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });

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
        team_1_scorers?: unknown;
        team_2_scorers?: unknown;
      }
    | null;

  const matchupId = typeof body?.matchupId === "string" ? body.matchupId.trim() : "";
  const teamOneScore = parseScore(body?.team_1_score);
  const teamTwoScore = parseScore(body?.team_2_score);
  const forfeitedTeamId =
    typeof body?.forfeited_team_id === "string" ? body.forfeited_team_id.trim() || null : null;
  const teamOneScorers = parseScorers(body?.team_1_scorers);
  const teamTwoScorers = parseScorers(body?.team_2_scorers);

  if (!matchupId) {
    return NextResponse.json({ error: "Missing matchup ID." }, { status: 400 });
  }

  if (teamOneScore === undefined || teamTwoScore === undefined) {
    return NextResponse.json({ error: "Scores must be blank or nonnegative whole numbers." }, { status: 400 });
  }

  if (teamOneScorers === undefined || teamTwoScorers === undefined) {
    return NextResponse.json(
      { error: "Scorers must be valid linked players or names up to 100 characters." },
      { status: 400 },
    );
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

  if (!forfeitedTeamId) {
    if (
      teamOneScorers.length > 0 &&
      (teamOneScore === null || teamOneScorers.some((scorer) => scorer.goalNumber > teamOneScore))
    ) {
      return NextResponse.json({ error: "Team 1 cannot have more scorers than goals." }, { status: 400 });
    }

    if (
      teamTwoScorers.length > 0 &&
      (teamTwoScore === null || teamTwoScorers.some((scorer) => scorer.goalNumber > teamTwoScore))
    ) {
      return NextResponse.json({ error: "Team 2 cannot have more scorers than goals." }, { status: 400 });
    }
  }

  const [teamOneResponse, teamTwoResponse] = await Promise.all([
    existingMatchup.team_1_id
      ? supabase.from("sunday_league_teams").select("*").eq("id", existingMatchup.team_1_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    existingMatchup.team_2_id
      ? supabase.from("sunday_league_teams").select("*").eq("id", existingMatchup.team_2_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (teamOneResponse.error || teamTwoResponse.error) {
    return NextResponse.json({ error: teamOneResponse.error?.message ?? teamTwoResponse.error?.message ?? "Could not load teams." }, { status: 500 });
  }

  const goalRows: SundayLeagueMatchupGoalInsert[] = [];
  try {
    if (!forfeitedTeamId && existingMatchup.team_1_id && teamOneResponse.data) {
      const rosterByProfileId = await getRosterPlayersByProfileId(supabase, teamOneResponse.data as SundayLeagueTeam);
      goalRows.push(...buildGoalRows(matchupId, existingMatchup.team_1_id, teamOneScorers, rosterByProfileId));
    }

    if (!forfeitedTeamId && existingMatchup.team_2_id && teamTwoResponse.data) {
      const rosterByProfileId = await getRosterPlayersByProfileId(supabase, teamTwoResponse.data as SundayLeagueTeam);
      goalRows.push(...buildGoalRows(matchupId, existingMatchup.team_2_id, teamTwoScorers, rosterByProfileId));
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not validate goal scorers." },
      { status: 400 },
    );
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

  const { error: deleteGoalsError } = await supabase.from("sunday_league_matchup_goals").delete().eq("matchup_id", matchupId);
  if (deleteGoalsError) {
    return NextResponse.json({ error: `Score saved, but scorers could not be reset: ${deleteGoalsError.message}` }, { status: 500 });
  }

  let savedGoals: SundayLeagueMatchupGoal[] = [];
  if (goalRows.length > 0) {
    const { data: insertedGoals, error: insertGoalsError } = await supabase
      .from("sunday_league_matchup_goals")
      .insert(goalRows)
      .select("*");

    if (insertGoalsError) {
      return NextResponse.json({ error: `Score saved, but scorers could not be saved: ${insertGoalsError.message}` }, { status: 500 });
    }

    savedGoals = (insertedGoals ?? []) as SundayLeagueMatchupGoal[];
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
        goals: savedGoals,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ matchup: data, goals: savedGoals });
}
