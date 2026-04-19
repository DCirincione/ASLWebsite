import { NextRequest, NextResponse } from "next/server";

import { getBearerToken, getSupabaseServiceRole, getSupabaseWithToken } from "@/lib/admin-route-auth";
import {
  getSundayLeagueFreeAgentMetadata,
  type SundayLeagueAvailability,
  type SundayLeagueDominantFoot,
  type SundayLeagueExperienceLevel,
  type SundayLeaguePositionGroup,
  type SundayLeagueSkillLevelLabel,
} from "@/lib/sunday-league-free-agent";
import type { Profile, SundayLeagueTeamMember } from "@/lib/supabase/types";

type FreeAgentApiEntry = {
  id: string;
  free_agent_member_id: string;
  name: string;
  email: string | null;
  phone_number: string | null;
  age: string | null;
  preferred_positions: string | null;
  position_groups: SundayLeaguePositionGroup[];
  secondary_position: string | null;
  dominant_foot: SundayLeagueDominantFoot | null;
  skill_level_label: SundayLeagueSkillLevelLabel | null;
  experience_level: SundayLeagueExperienceLevel | null;
  strengths: string | null;
  weaknesses: string | null;
  play_style: string | null;
  sunday_availability: SundayLeagueAvailability | null;
  known_conflicts: string | null;
  avatar_url: string | null;
  country_code: null;
  positions: string[] | null;
  skill_level: number | null;
  sports: string[] | null;
  about: string | null;
  height_cm: string | null;
  weight_lbs: number | null;
};

type FreeAgentProfile = Pick<
  Profile,
  "id" | "name" | "about" | "avatar_url" | "positions" | "skill_level" | "sports"
>;

const parseOptionalNumber = (value?: string | null) => {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function GET(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    const teamId = req.nextUrl.searchParams.get("teamId")?.trim() || "";

    if (!token || !teamId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const userClient = getSupabaseWithToken(token);
    if (!userClient) {
      return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
    }

    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    const userId = userData.user?.id ?? null;
    if (userError || !userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const serviceClient = getSupabaseServiceRole();
    if (!serviceClient) {
      return NextResponse.json({ error: "Server Supabase service role is not configured." }, { status: 500 });
    }

    const { data: teamData, error: teamError } = await serviceClient
      .from("sunday_league_teams")
      .select("id,user_id")
      .eq("id", teamId)
      .maybeSingle();

    if (teamError) {
      return NextResponse.json({ error: teamError.message }, { status: 500 });
    }
    if (!teamData) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }

    if (teamData.user_id !== userId) {
      const { data: roleData, error: roleError } = await serviceClient
        .from("sunday_league_team_members")
        .select("id")
        .eq("team_id", teamId)
        .eq("player_user_id", userId)
        .eq("status", "accepted")
        .eq("role", "co_captain")
        .maybeSingle();

      if (roleError) {
        return NextResponse.json({ error: roleError.message }, { status: 500 });
      }
      if (!roleData) {
        return NextResponse.json({ error: "Only the captain or an accepted co-captain can view free agents." }, { status: 403 });
      }
    }

    const [freeAgentRowsResponse, acceptedMembersResponse, currentTeamRowsResponse, captainRowsResponse] = await Promise.all([
      serviceClient
        .from("sunday_league_team_members")
        .select("id,player_user_id,invite_email,invite_name,created_at,updated_at")
        .eq("source", "free_agent")
        .eq("status", "free_agent")
        .order("updated_at", { ascending: false }),
      serviceClient
        .from("sunday_league_team_members")
        .select("player_user_id")
        .eq("status", "accepted"),
      serviceClient
        .from("sunday_league_team_members")
        .select("player_user_id")
        .eq("team_id", teamId)
        .in("status", ["pending", "accepted"]),
      serviceClient.from("sunday_league_teams").select("user_id"),
    ]);

    for (const response of [freeAgentRowsResponse, acceptedMembersResponse, currentTeamRowsResponse, captainRowsResponse]) {
      if (response.error) {
        return NextResponse.json({ error: response.error.message }, { status: 500 });
      }
    }

    const blockedIds = new Set<string>();
    for (const row of (acceptedMembersResponse.data ?? []) as Array<{ player_user_id?: string | null }>) {
      if (row.player_user_id) {
        blockedIds.add(row.player_user_id);
      }
    }
    for (const row of (currentTeamRowsResponse.data ?? []) as Array<{ player_user_id?: string | null }>) {
      if (row.player_user_id) {
        blockedIds.add(row.player_user_id);
      }
    }
    for (const captain of (captainRowsResponse.data ?? []) as Array<{ user_id?: string | null }>) {
      if (captain.user_id) {
        blockedIds.add(captain.user_id);
      }
    }

    const freeAgentRows = new Map<
      string,
      Pick<SundayLeagueTeamMember, "id" | "player_user_id" | "invite_email" | "invite_name" | "created_at" | "updated_at">
    >();
    for (const row of (freeAgentRowsResponse.data ?? []) as Array<
      Pick<SundayLeagueTeamMember, "id" | "player_user_id" | "invite_email" | "invite_name" | "created_at" | "updated_at">
    >) {
      if (!row.player_user_id || blockedIds.has(row.player_user_id)) continue;

      const existing = freeAgentRows.get(row.player_user_id);
      const existingTimestamp = existing?.updated_at ?? existing?.created_at ?? "";
      const nextTimestamp = row.updated_at ?? row.created_at ?? "";

      if (!existing || nextTimestamp >= existingTimestamp) {
        freeAgentRows.set(row.player_user_id, row);
      }
    }

    const freeAgentIds = Array.from(freeAgentRows.keys());
    if (freeAgentIds.length === 0) {
      return NextResponse.json({ freeAgents: [] satisfies FreeAgentApiEntry[] });
    }

    const { data: profileData, error: profileError } = await serviceClient
      .from("profiles")
      .select("id,name,about,avatar_url,positions,skill_level,sports")
      .in("id", freeAgentIds);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    const profileMap = new Map((profileData ?? []).map((profile) => [profile.id, profile as FreeAgentProfile]));
    const authUsers = await Promise.all(
      freeAgentIds.map(async (freeAgentId) => {
        const { data, error } = await serviceClient.auth.admin.getUserById(freeAgentId);
        return {
          id: freeAgentId,
          user: error ? null : data.user,
        };
      }),
    );

    const authUserMap = new Map(authUsers.map((entry) => [entry.id, entry.user]));
    const freeAgents = freeAgentIds
      .map((freeAgentId) => {
        const row = freeAgentRows.get(freeAgentId);
        if (!row) return null;

        const profile = profileMap.get(freeAgentId);
        const authUser = authUserMap.get(freeAgentId);
        const metadata = getSundayLeagueFreeAgentMetadata(authUser?.user_metadata);
        const name =
          profile?.name?.trim()
          || row.invite_name?.trim()
          || (typeof authUser?.user_metadata?.name === "string" ? authUser.user_metadata.name.trim() : "")
          || "Player";

        return {
          id: freeAgentId,
          free_agent_member_id: row.id,
          name,
          email: row.invite_email?.trim() || authUser?.email?.trim() || null,
          phone_number: metadata.phone_number ?? null,
          age: metadata.age ?? null,
          preferred_positions: metadata.preferred_positions ?? null,
          position_groups: metadata.position_groups ?? [],
          secondary_position: metadata.secondary_position ?? null,
          dominant_foot: metadata.dominant_foot ?? null,
          skill_level_label: metadata.skill_level_label ?? null,
          experience_level: metadata.experience_level ?? null,
          strengths: metadata.strengths ?? null,
          weaknesses: metadata.weaknesses ?? null,
          play_style: metadata.play_style ?? null,
          sunday_availability: metadata.sunday_availability ?? null,
          known_conflicts: metadata.known_conflicts ?? null,
          avatar_url: profile?.avatar_url ?? null,
          country_code: null,
          positions: profile?.positions ?? null,
          skill_level: profile?.skill_level ?? null,
          sports: profile?.sports ?? null,
          about: profile?.about ?? null,
          height_cm: metadata.height_cm ?? null,
          weight_lbs: parseOptionalNumber(metadata.weight_lbs),
        } satisfies FreeAgentApiEntry;
      })
      .filter((entry): entry is FreeAgentApiEntry => entry !== null)
      .sort((left, right) => left.name.localeCompare(right.name));

    return NextResponse.json({ freeAgents });
  } catch {
    return NextResponse.json({ error: "Could not load the free agent portal." }, { status: 500 });
  }
}
