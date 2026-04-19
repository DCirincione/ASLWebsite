"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AvatarImage } from "@/components/avatar-image";
import { HistoryBackButton } from "@/components/history-back-button";
import { PageShell } from "@/components/page-shell";
import { TeamLogoImage } from "@/components/team-logo-image";
import { countryCodeToFlag, getCountryFlagAsset, getCountryNameFromCode } from "@/lib/countries";
import {
  findPendingFriendRequestBetweenUsers,
  formatSundayLeaguePlayerName,
  getSundayLeagueDivisionLogoSrc,
  isFriendRequestPairConstraintError,
  type SundayLeagueDivision,
} from "@/lib/sunday-league";
import { supabase } from "@/lib/supabase/client";
import type { FriendRequest, SundayLeagueLeaderboard, SundayLeagueScheduleWeek, SundayLeagueTeam, SundayLeagueTeamMember } from "@/lib/supabase/types";

type TeamRosterPlayer = {
  id: string;
  profileId: string | null;
  name: string;
  position: string | null;
  avatarUrl: string | null;
  countryCode: string | null;
  jerseyNumber: string | null;
  role: "player" | "captain" | "co_captain";
};

type TeamMemberProfile = {
  id: string;
  name: string | null;
  avatar_url: string | null;
  country_code: string | null;
  positions: string[] | null;
};
type ActionState = { type: "idle" | "loading" | "success" | "error"; message?: string };

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

export default function SundayLeaguePublicTeamPage() {
  const params = useParams<{ teamId: string }>();
  const router = useRouter();
  const teamId = params.teamId;
  const [team, setTeam] = useState<SundayLeagueTeam | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [myMemberships, setMyMemberships] = useState<SundayLeagueTeamMember[]>([]);
  const [managedTeamId, setManagedTeamId] = useState<string | null>(null);
  const [viewerMembership, setViewerMembership] = useState<SundayLeagueTeamMember | null>(null);
  const [coCaptainName, setCoCaptainName] = useState<string | null>(null);
  const [scheduleWeeks, setScheduleWeeks] = useState<SundayLeagueScheduleWeek[]>([]);
  const [rosterPlayers, setRosterPlayers] = useState<TeamRosterPlayer[]>([]);
  const [record, setRecord] = useState<Pick<SundayLeagueLeaderboard, "wins" | "draws" | "losses">>({ wins: 0, draws: 0, losses: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [leaveState, setLeaveState] = useState<ActionState>({ type: "idle" });
  const [joinState, setJoinState] = useState<ActionState>({ type: "idle" });

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
      setLeaveState({ type: "idle" });
      setJoinState({ type: "idle" });

      const { data: sessionData } = await supabase.auth.getSession();
      const nextUserId = sessionData.session?.user.id ?? null;
      const nextUserEmail = sessionData.session?.user.email?.trim().toLowerCase() ?? null;
      setCurrentUserId(nextUserId);

      if (nextUserId) {
        const membershipResults = await Promise.all([
          supabase.from("sunday_league_team_members").select("*").eq("player_user_id", nextUserId),
          nextUserEmail
            ? supabase.from("sunday_league_team_members").select("*").eq("invite_email", nextUserEmail)
            : Promise.resolve({ data: [], error: null }),
          supabase.from("sunday_league_teams").select("id").eq("user_id", nextUserId).limit(1),
        ]);

        const membershipMap = new Map<string, SundayLeagueTeamMember>();
        for (const result of membershipResults.slice(0, 2)) {
          if (result.error || !result.data) continue;
          for (const membership of result.data as SundayLeagueTeamMember[]) {
            membershipMap.set(membership.id, membership);
          }
        }

        const nextMemberships = Array.from(membershipMap.values());
        setMyMemberships(nextMemberships);
        setManagedTeamId((membershipResults[2].data?.[0]?.id as string | undefined) ?? null);
        setViewerMembership(
          nextUserId !== nextTeam.user_id
            ? nextMemberships.find((membership) => membership.team_id === nextTeam.id && membership.status === "accepted") ?? null
            : null,
        );
      } else {
        setMyMemberships([]);
        setManagedTeamId(null);
        setViewerMembership(null);
      }

      const [leaderboardResponse, memberResponse] = await Promise.all([
        supabase
          .from("sunday_league_leaderboard")
          .select("wins,draws,losses")
          .eq("team_id", nextTeam.id)
          .maybeSingle(),
        supabase
          .from("sunday_league_team_members")
          .select("*")
          .eq("team_id", nextTeam.id)
          .eq("status", "accepted")
          .order("created_at", { ascending: true }),
      ]);

      setRecord({
        wins: leaderboardResponse.data?.wins ?? 0,
        draws: leaderboardResponse.data?.draws ?? 0,
        losses: leaderboardResponse.data?.losses ?? 0,
      });

      const members = (memberResponse.data ?? []) as SundayLeagueTeamMember[];
      const profileIds = new Set<string>();
      if (nextTeam.captain_is_playing) {
        profileIds.add(nextTeam.user_id);
      }
      for (const member of members) {
        if (member.player_user_id) {
          profileIds.add(member.player_user_id);
        }
      }

      const profileMap = new Map<string, TeamMemberProfile>();
      if (profileIds.size > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id,name,avatar_url,positions")
          .in("id", Array.from(profileIds));

        for (const profile of (profileData ?? []) as TeamMemberProfile[]) {
          profileMap.set(profile.id, profile);
        }
      }

      const nextRosterPlayers: TeamRosterPlayer[] = [];
      if (nextTeam.captain_is_playing) {
        const captainProfile = profileMap.get(nextTeam.user_id);
        nextRosterPlayers.push({
          id: nextTeam.user_id,
          profileId: nextTeam.user_id,
          name: captainProfile?.name?.trim() || nextTeam.captain_name,
          position: Array.isArray(captainProfile?.positions) ? captainProfile.positions[0] ?? null : null,
          avatarUrl: captainProfile?.avatar_url ?? null,
          countryCode: captainProfile?.country_code?.trim()?.toUpperCase() ?? null,
          jerseyNumber: nextTeam.jersey_numbers?.[0]?.trim() || null,
          role: "captain",
        });
      }

      members
        .filter((member) => member.player_user_id && member.player_user_id !== nextTeam.user_id)
        .forEach((member, index) => {
          const profile = profileMap.get(member.player_user_id as string);
          nextRosterPlayers.push({
            id: member.id,
            profileId: member.player_user_id ?? null,
            name: profile?.name?.trim() || member.invite_name?.trim() || "Player",
            position: Array.isArray(profile?.positions) ? profile.positions[0] ?? null : null,
            avatarUrl: profile?.avatar_url ?? null,
            countryCode: profile?.country_code?.trim()?.toUpperCase() ?? null,
            jerseyNumber: nextTeam.jersey_numbers?.[index + (nextTeam.captain_is_playing ? 1 : 0)]?.trim() || null,
            role: member.role === "co_captain" ? "co_captain" : "player",
          });
        });

      const coCaptain = members.find((member) => member.role === "co_captain" && member.player_user_id);
      const coCaptainProfile = coCaptain?.player_user_id ? profileMap.get(coCaptain.player_user_id) : null;
      setCoCaptainName(coCaptainProfile?.name?.trim() || coCaptain?.invite_name?.trim() || null);
      setRosterPlayers(nextRosterPlayers);
      setStatus("ready");
    };

    void loadTeam();
  }, [teamId]);

  useEffect(() => {
    const loadScheduleWeeks = async () => {
      if (!supabase) return;

      const { data, error } = await supabase
        .from("sunday_league_schedule_weeks")
        .select("*")
        .order("week_number", { ascending: true });

      if (!error) {
        setScheduleWeeks((data ?? []) as SundayLeagueScheduleWeek[]);
      }
    };

    void loadScheduleWeeks();
  }, []);

  const historyRows = useMemo(() => buildTeamHistory(team), [team]);
  const establishedLabel = useMemo(() => getEstablishedLabel(team), [team]);
  const membershipByTeamId = useMemo(() => {
    const rank = { accepted: 4, pending: 3, declined: 2, free_agent: 1 } as const;
    const map = new Map<string, SundayLeagueTeamMember>();

    for (const membership of myMemberships) {
      if (!membership.team_id) continue;
      const existing = map.get(membership.team_id);
      if (!existing || rank[membership.status] > rank[existing.status]) {
        map.set(membership.team_id, membership);
      }
    }

    return map;
  }, [myMemberships]);
  const acceptedMembership = useMemo(
    () => myMemberships.find((membership) => membership.status === "accepted" && membership.team_id) ?? null,
    [myMemberships],
  );
  const currentTeamMembership = useMemo(
    () => (team ? membershipByTeamId.get(team.id) ?? null : null),
    [membershipByTeamId, team],
  );
  const canLeaveTeam = useMemo(
    () => Boolean(team && currentUserId && viewerMembership && currentUserId !== team.user_id),
    [currentUserId, team, viewerMembership],
  );
  const canShowJoinAction = useMemo(() => {
    if (!team || canLeaveTeam) return false;
    if (currentUserId === team.user_id) return false;
    if (managedTeamId) return false;
    if (acceptedMembership && acceptedMembership.team_id !== team.id) return false;
    return true;
  }, [acceptedMembership, canLeaveTeam, currentUserId, managedTeamId, team]);

  const handleRequestToJoin = async () => {
    if (!supabase || !team) {
      setJoinState({ type: "error", message: "Supabase is not configured." });
      return;
    }

    if (!currentUserId) {
      router.push("/account/create");
      return;
    }

    if (managedTeamId) {
      setJoinState({ type: "error", message: "Team managers already manage their own team here." });
      return;
    }

    if (acceptedMembership && acceptedMembership.team_id !== team.id) {
      setJoinState({ type: "error", message: "You already belong to another Sunday League team." });
      return;
    }

    setJoinState({ type: "loading" });

    const { data: existingFriendRequests, error: friendRequestError } = await supabase
      .from("friend_requests")
      .select("id,sender_id,receiver_id,status")
      .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${team.user_id}),and(sender_id.eq.${team.user_id},receiver_id.eq.${currentUserId})`);

    if (!friendRequestError) {
      const pendingFriendRequest = findPendingFriendRequestBetweenUsers(
        existingFriendRequests as FriendRequest[] | null,
        currentUserId,
        team.user_id,
      );

      if (pendingFriendRequest) {
        setJoinState({
          type: "error",
          message: "There is already a pending friend request between you and this captain. Use the team join request only, not both at once.",
        });
        return;
      }
    }

    const existingMembership = membershipByTeamId.get(team.id) ?? null;
    const payload = {
      team_id: team.id,
      player_user_id: currentUserId,
      invite_email: null,
      invite_name: null,
      status: "pending" as const,
      source: "player_request" as const,
    };

    const response = existingMembership
      ? await supabase
          .from("sunday_league_team_members")
          .update(payload)
          .eq("id", existingMembership.id)
          .select("*")
          .single()
      : await supabase
          .from("sunday_league_team_members")
          .insert(payload)
          .select("*")
          .single();

    if (response.error || !response.data) {
      setJoinState({
        type: "error",
        message: isFriendRequestPairConstraintError(response.error?.message)
          ? "A friend request already exists between you and this captain. Use the team join request only, not both at once."
          : response.error?.message ?? "Could not send your join request.",
      });
      return;
    }

    const nextMembership = response.data as SundayLeagueTeamMember;
    setMyMemberships((prev) => {
      const next = prev.filter((membership) => membership.id !== nextMembership.id);
      next.push(nextMembership);
      return next;
    });
    setJoinState({ type: "success", message: "Join request sent to the captain." });
  };

  const handleLeaveTeam = async () => {
    if (!supabase || !team || !currentUserId || !viewerMembership) return;

    const confirmMessage =
      viewerMembership.role === "co_captain"
        ? `Leave ${team.team_name} and remove your co-captain access?`
        : `Leave ${team.team_name}?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setLeaveState({ type: "loading" });

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token ?? null;
    if (!accessToken) {
      setLeaveState({ type: "error", message: "Sign in again to continue." });
      return;
    }

    const response = await fetch("/api/sunday-league/leave-team", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ teamId: team.id }),
    });
    const json = await response.json();

    if (!response.ok) {
      setLeaveState({ type: "error", message: json?.error ?? "Could not leave the team." });
      return;
    }

    setViewerMembership(null);
    setRosterPlayers((prev) => prev.filter((player) => !json?.deletedMembershipIds?.includes(player.id)));
    if (json?.removedCoCaptain) {
      setCoCaptainName(null);
    }
    setLeaveState({
      type: "success",
      message: json?.removedCoCaptain ? "You left the team and no longer have co-captain access." : "You left the team.",
    });
    router.replace("/leagues/sunday-league");
    router.refresh();
  };

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
                    {coCaptainName ? <p className="sunday-league-team-board__captain">Co-Captain: {coCaptainName}</p> : null}
                    {canLeaveTeam ? (
                      <div className="sunday-league-team-board__identity-actions">
                        <button className="button ghost" type="button" onClick={() => void handleLeaveTeam()} disabled={leaveState.type === "loading"}>
                          {leaveState.type === "loading" ? "Leaving..." : "Leave Team"}
                        </button>
                        {leaveState.message ? (
                          <p className={`form-help ${leaveState.type === "error" ? "error" : leaveState.type === "success" ? "success" : ""}`}>
                            {leaveState.message}
                          </p>
                        ) : null}
                      </div>
                    ) : canShowJoinAction ? (
                      <div className="sunday-league-team-board__identity-actions">
                        {(() => {
                          const isInvitePending = currentTeamMembership?.status === "pending" && currentTeamMembership.source === "captain_invite";
                          const isRequestPending = currentTeamMembership?.status === "pending" && currentTeamMembership.source === "player_request";

                          let label = "Request to Join";
                          let disabled = false;
                          let onClick: () => void = () => void handleRequestToJoin();

                          if (joinState.type === "loading") {
                            label = "Sending...";
                            disabled = true;
                          } else if (isRequestPending) {
                            label = "Request Sent";
                            disabled = true;
                          } else if (isInvitePending) {
                            label = "View Invite";
                            onClick = () => router.push("/account/team");
                          } else if (!currentUserId) {
                            onClick = () => router.push("/account/create");
                          } else if (currentTeamMembership?.status === "declined") {
                            label = "Request Again";
                          }

                          return (
                            <button className="button primary" type="button" onClick={onClick} disabled={disabled}>
                              {label}
                            </button>
                          );
                        })()}
                        {joinState.message ? (
                          <p className={`form-help ${joinState.type === "error" ? "error" : joinState.type === "success" ? "success" : ""}`}>
                            {joinState.message}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="sunday-league-team-board__meta">
                    <p className="sunday-league-team-board__established">Established {establishedLabel}</p>
                    <div className="sunday-league-team-board__record">
                      <span>{record.wins}</span>
                      <span>-</span>
                      <span>{record.draws}</span>
                      <span>-</span>
                      <span>{record.losses}</span>
                    </div>
                  </div>
                  <div className="sunday-league-team-board__logo">
                    <TeamLogoImage src={team.team_logo_url} alt="" fill sizes="220px" />
                  </div>
                </div>

                <section className="sunday-league-team-board__section">
                  <h3>Roster</h3>
                  {rosterPlayers.length > 0 ? (
                    <div className="sunday-league-team-board__roster">
                      {rosterPlayers.map((player) => {
                        const customFlagAsset = getCountryFlagAsset(player.countryCode);
                        const playerName = formatSundayLeaguePlayerName(player.name);
                        const profileHref = player.profileId ? `/profiles/${player.profileId}` : null;
                        const cardContent = (
                          <>
                            {player.role !== "player" ? (
                              <span
                                className="sunday-league-team-board__player-crown"
                                role="img"
                                aria-label={player.role === "captain" ? "Captain" : "Co-Captain"}
                              >
                                <Image src="/fifa-card/crown.png" alt="" width={56} height={56} loading="eager" />
                              </span>
                            ) : null}
                            <div className="sunday-league-team-board__player-avatar-wrap">
                              <div className="sunday-league-team-board__player-avatar">
                                <AvatarImage src={player.avatarUrl} alt={player.name} objectPosition="center 57%" />
                              </div>
                            </div>
                            <div className="sunday-league-team-board__player-panel">
                              <div className="sunday-league-team-board__player-identity">
                                <p className="sunday-league-team-board__player-name">
                                  <span className="sunday-league-team-board__player-name-line">{playerName.topLine}</span>
                                  <span className="sunday-league-team-board__player-name-line">{playerName.bottomLine}</span>
                                </p>
                                <p className="sunday-league-team-board__player-position">{player.position ?? "Player"}</p>
                              </div>
                              <div className="sunday-league-team-board__player-row">
                                {customFlagAsset ? (
                                  <span className="sunday-league-team-board__player-flag" aria-label={getCountryNameFromCode(player.countryCode) ?? undefined}>
                                    <Image
                                      src={customFlagAsset.src}
                                      alt=""
                                      width={customFlagAsset.width}
                                      height={customFlagAsset.height}
                                      className="sunday-league-team-board__player-flag-image"
                                      style={{ width: "34px", height: "auto" }}
                                    />
                                  </span>
                                ) : countryCodeToFlag(player.countryCode) ? (
                                  <p className="sunday-league-team-board__player-flag" aria-label={getCountryNameFromCode(player.countryCode) ?? undefined}>
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
                                  width={3141}
                                  height={949}
                                  className="sunday-league-team-board__player-division-image"
                                  style={{ width: "144px", height: "auto" }}
                                />
                              </div>
                            </div>
                          </>
                        );

                        return (
                          profileHref ? (
                            <Link
                              key={player.id}
                              href={profileHref}
                              className="sunday-league-team-board__player-card sunday-league-team-board__player-card--link"
                              aria-label={`View ${player.name}'s profile`}
                            >
                              {cardContent}
                            </Link>
                          ) : (
                            <article key={player.id} className="sunday-league-team-board__player-card">
                              {cardContent}
                            </article>
                          )
                        );
                      })}
                    </div>
                  ) : (
                    <p className="muted">No players have signed up for this roster yet.</p>
                  )}
                </section>

                <section className="sunday-league-team-board__section">
                  <h3>Schedule</h3>
                  {scheduleWeeks.length === 0 ? (
                    <p className="muted">No weekly schedule has been posted yet.</p>
                  ) : (
                    <p className="muted">Weekly field assignments and match times are posted on the Sunday League schedule page.</p>
                  )}
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
