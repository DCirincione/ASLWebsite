import { NextRequest, NextResponse } from "next/server";

import { getBearerToken, getSupabaseServiceRole, getSupabaseWithToken } from "@/lib/admin-route-auth";

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) {
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

    const body = (await req.json()) as { teamId?: string };
    const teamId = body.teamId?.trim() || "";
    if (!teamId) {
      return NextResponse.json({ error: "Team ID is required." }, { status: 400 });
    }

    const serviceClient = getSupabaseServiceRole();
    if (!serviceClient) {
      return NextResponse.json({ error: "Server Supabase service role is not configured." }, { status: 500 });
    }

    const { data: teamData, error: teamError } = await serviceClient
      .from("sunday_league_teams")
      .select("id,team_name,user_id")
      .eq("id", teamId)
      .maybeSingle();

    if (teamError) {
      return NextResponse.json({ error: teamError.message }, { status: 500 });
    }
    if (!teamData) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }
    if (teamData.user_id === userId) {
      return NextResponse.json({ error: "Captains cannot leave their own team from this action." }, { status: 400 });
    }

    const { data: memberships, error: membershipError } = await serviceClient
      .from("sunday_league_team_members")
      .select("id,role")
      .eq("team_id", teamId)
      .eq("player_user_id", userId)
      .eq("status", "accepted");

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }
    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ error: "No active team membership was found." }, { status: 404 });
    }

    const membershipIds = memberships.map((membership) => membership.id);
    const removedCoCaptain = memberships.some((membership) => membership.role === "co_captain");

    const { error: deleteError } = await serviceClient
      .from("sunday_league_team_members")
      .delete()
      .in("id", membershipIds);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      deletedMembershipIds: membershipIds,
      removedCoCaptain,
      teamName: teamData.team_name,
    });
  } catch {
    return NextResponse.json({ error: "Could not leave the team." }, { status: 500 });
  }
}
