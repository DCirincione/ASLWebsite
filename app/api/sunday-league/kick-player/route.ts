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

    const body = (await req.json()) as { memberId?: string; teamId?: string };
    const teamId = body.teamId?.trim() || "";
    const memberId = body.memberId?.trim() || "";

    if (!teamId || !memberId) {
      return NextResponse.json({ error: "Team ID and player ID are required." }, { status: 400 });
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

    const viewerIsCaptain = teamData.user_id === userId;
    if (!viewerIsCaptain) {
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
        return NextResponse.json({ error: "Only the captain or an accepted co-captain can remove players." }, { status: 403 });
      }
    }

    const { data: memberData, error: memberError } = await serviceClient
      .from("sunday_league_team_members")
      .select("id,team_id,player_user_id,role,status")
      .eq("id", memberId)
      .maybeSingle();

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }
    if (!memberData || memberData.team_id !== teamId) {
      return NextResponse.json({ error: "Player not found on this team." }, { status: 404 });
    }
    if (memberData.status !== "accepted") {
      return NextResponse.json({ error: "Only accepted roster players can be removed." }, { status: 400 });
    }
    if (!viewerIsCaptain && memberData.player_user_id === userId) {
      return NextResponse.json({ error: "Use Leave Team to remove yourself from the roster." }, { status: 400 });
    }

    const { error: deleteError } = await serviceClient
      .from("sunday_league_team_members")
      .delete()
      .eq("id", memberId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      removedCoCaptain: memberData.role === "co_captain",
      teamName: teamData.team_name,
    });
  } catch {
    return NextResponse.json({ error: "Could not remove that player." }, { status: 500 });
  }
}
