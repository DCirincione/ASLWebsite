"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AccessibilityControls } from "@/components/accessibility-controls";
import { AccountNav } from "@/components/account-nav";
import { TeamLogoImage } from "@/components/team-logo-image";
import { supabase } from "@/lib/supabase/client";
import type { SundayLeagueTeam, SundayLeagueTeamMember } from "@/lib/supabase/types";

type AccountSundayLeagueTeam = Pick<SundayLeagueTeam, "id" | "team_name" | "team_logo_url" | "user_id">;
type TeamInvite = SundayLeagueTeamMember & { team: AccountSundayLeagueTeam | null };
type ActionState = { type: "idle" | "loading" | "success" | "error"; message?: string };

export default function AccountTeamPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [managedTeams, setManagedTeams] = useState<AccountSundayLeagueTeam[]>([]);
  const [joinedTeams, setJoinedTeams] = useState<AccountSundayLeagueTeam[]>([]);
  const [pendingInvites, setPendingInvites] = useState<TeamInvite[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "no-session">("loading");
  const [inviteStates, setInviteStates] = useState<Record<string, ActionState>>({});

  const loadTeams = useCallback(async () => {
    if (!supabase) {
      setManagedTeams([]);
      setJoinedTeams([]);
      setPendingInvites([]);
      setStatus("ready");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    const nextUserId = session?.user.id ?? null;
    const nextUserEmail = session?.user.email?.trim().toLowerCase() ?? null;

    setUserId(nextUserId);
    setUserEmail(nextUserEmail);

    if (!nextUserId) {
      setStatus("no-session");
      return;
    }

    const [captainResponse, membershipResponse, inviteResponse] = await Promise.all([
      supabase
        .from("sunday_league_teams")
        .select("id,team_name,team_logo_url,user_id")
        .eq("user_id", nextUserId)
        .order("created_at", { ascending: false }),
      supabase.from("sunday_league_team_members").select("*").eq("player_user_id", nextUserId),
      nextUserEmail
        ? supabase
            .from("sunday_league_team_members")
            .select("*")
            .eq("invite_email", nextUserEmail)
            .eq("source", "captain_invite")
            .eq("status", "pending")
        : Promise.resolve({ data: [], error: null }),
    ]);

    const captainList = (captainResponse.data ?? []) as AccountSundayLeagueTeam[];
    const membershipMap = new Map<string, SundayLeagueTeamMember>();
    for (const response of [membershipResponse, inviteResponse]) {
      if (response.error || !response.data) continue;
      for (const membership of response.data as SundayLeagueTeamMember[]) {
        membershipMap.set(membership.id, membership);
      }
    }

    const memberships = Array.from(membershipMap.values());
    const managedTeamIds = new Set(captainList.map((team) => team.id));
    for (const membership of memberships) {
      if (membership.status === "accepted" && membership.role === "co_captain") {
        managedTeamIds.add(membership.team_id);
      }
    }

    const relatedTeamIds = Array.from(new Set([...memberships.map((membership) => membership.team_id), ...managedTeamIds]));
    let teamMap = new Map<string, AccountSundayLeagueTeam>();

    if (relatedTeamIds.length > 0) {
      const { data: teamData } = await supabase
        .from("sunday_league_teams")
        .select("id,team_name,team_logo_url,user_id")
        .in("id", relatedTeamIds);

      teamMap = new Map((teamData ?? []).map((team) => [team.id, team as AccountSundayLeagueTeam]));
    }

    setManagedTeams([
      ...captainList,
      ...Array.from(managedTeamIds)
        .filter((teamId) => !captainList.some((team) => team.id === teamId))
        .map((teamId) => teamMap.get(teamId) ?? null)
        .filter((team): team is AccountSundayLeagueTeam => Boolean(team)),
    ]);
    setJoinedTeams(
      memberships
        .filter((membership) => membership.status === "accepted")
        .map((membership) => teamMap.get(membership.team_id) ?? null)
        .filter((team): team is AccountSundayLeagueTeam => Boolean(team && !managedTeamIds.has(team.id))),
    );
    setPendingInvites(
      memberships
        .filter((membership) => membership.source === "captain_invite" && membership.status === "pending")
        .map((membership) => ({
          ...membership,
          team: teamMap.get(membership.team_id) ?? null,
        })),
    );
    setStatus("ready");
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadTeams();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadTeams]);

  const handleInviteResponse = async (invite: TeamInvite, nextStatus: "accepted" | "declined") => {
    if (!supabase || !userId || !userEmail) return;

    if (nextStatus === "accepted" && managedTeams.length > 0) {
      setInviteStates((prev) => ({
        ...prev,
        [invite.id]: { type: "error", message: "Team managers already manage their own Sunday League team." },
      }));
      return;
    }

    setInviteStates((prev) => ({ ...prev, [invite.id]: { type: "loading" } }));

    if (nextStatus === "accepted") {
      const { data: acceptedConflict } = await supabase
        .from("sunday_league_team_members")
        .select("id")
        .eq("player_user_id", userId)
        .eq("status", "accepted")
        .neq("id", invite.id)
        .limit(1);

      if ((acceptedConflict ?? []).length > 0) {
        setInviteStates((prev) => ({
          ...prev,
          [invite.id]: { type: "error", message: "You are already on another Sunday League team." },
        }));
        return;
      }
    }

    const { error } = await supabase
      .from("sunday_league_team_members")
      .update({
        player_user_id: userId,
        invite_email: nextStatus === "accepted" ? null : userEmail,
        status: nextStatus,
      })
      .eq("id", invite.id);

    if (error) {
      setInviteStates((prev) => ({
        ...prev,
        [invite.id]: { type: "error", message: error.message },
      }));
      return;
    }

    await loadTeams();
    setInviteStates((prev) => ({
      ...prev,
      [invite.id]: {
        type: "success",
        message: nextStatus === "accepted" ? "Invite accepted. Your team is now listed below." : "Invite declined.",
      },
    }));
  };

  const hasAnyTeams = managedTeams.length > 0 || joinedTeams.length > 0 || pendingInvites.length > 0;

  return (
    <>
      <AccessibilityControls />
      <AccountNav />
      <div className="account-body shell">
        <header className="account-header">
          <div>
            <p className="eyebrow">Account</p>
            <h1>Your Sunday League Team</h1>
            <p className="muted">Manage your team portal, pending invites, and teams you have joined.</p>
          </div>
          <Link className="button primary" href="/leagues/sunday-league">
            Sunday League Hub
          </Link>
        </header>

        <section className="account-card">
          {status === "loading" ? <p className="muted">Loading your teams...</p> : null}
          {status === "no-session" ? <p className="muted">Sign in to view your teams.</p> : null}
          {status === "ready" && !hasAnyTeams ? <p className="muted">No teams yet. Create a team or request to join one to get started.</p> : null}

          {pendingInvites.length > 0 ? (
            <div className="sunday-league-stack">
              <div>
                <h2>Pending Invites</h2>
                <p className="muted">Captains can invite you directly by email. Accept an invite here to join that roster.</p>
              </div>
              <ul className="list list--grid">
                {pendingInvites.map((invite) => (
                  <li key={invite.id} className="team-card">
                    <div className="team-card__logo">
                      <TeamLogoImage src={invite.team?.team_logo_url ?? null} alt="" fill sizes="80px" />
                    </div>
                    <div className="team-card__info">
                      <p className="list__title">{invite.team?.team_name ?? "Sunday League Team"}</p>
                      <p className="muted">{invite.invite_name?.trim() || "Captain invite pending"}</p>
                      {inviteStates[invite.id]?.message ? (
                        <p
                          className={`form-help ${
                            inviteStates[invite.id]?.type === "error"
                              ? "error"
                              : inviteStates[invite.id]?.type === "success"
                                ? "success"
                                : ""
                          }`}
                        >
                          {inviteStates[invite.id]?.message}
                        </p>
                      ) : null}
                    </div>
                    <div className="sunday-league-team-card__actions">
                      <button
                        className="button primary"
                        type="button"
                        onClick={() => void handleInviteResponse(invite, "accepted")}
                        disabled={inviteStates[invite.id]?.type === "loading"}
                      >
                        {inviteStates[invite.id]?.type === "loading" ? "Saving..." : "Accept Invite"}
                      </button>
                      <button
                        className="button ghost"
                        type="button"
                        onClick={() => void handleInviteResponse(invite, "declined")}
                        disabled={inviteStates[invite.id]?.type === "loading"}
                      >
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {managedTeams.length > 0 ? (
            <div className="sunday-league-stack">
              <div>
                <h2>Teams You Manage</h2>
                <p className="muted">Open the portal to approve requests, invite players, manage captains, and edit your team.</p>
              </div>
              <ul className="list list--grid">
                {managedTeams.map((team) => (
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
            </div>
          ) : null}

          {joinedTeams.length > 0 ? (
            <div className="sunday-league-stack">
              <div>
                <h2>Teams You Joined</h2>
                <p className="muted">View the public team page for the roster and weekly schedule.</p>
              </div>
              <ul className="list list--grid">
                {joinedTeams.map((team) => (
                  <li key={team.id} className="team-card">
                    <div className="team-card__logo">
                      <TeamLogoImage src={team.team_logo_url} alt="" fill sizes="80px" />
                    </div>
                    <div className="team-card__info">
                      <p className="list__title">{team.team_name}</p>
                      <p className="muted">Accepted roster spot</p>
                    </div>
                    <Link className="button ghost" href={`/leagues/sunday-league/teams/${team.id}`}>
                      View Team
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
