"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { HistoryBackButton } from "@/components/history-back-button";
import { PageShell } from "@/components/page-shell";
import { TeamLogoImage } from "@/components/team-logo-image";
import { createId } from "@/lib/create-id";
import { getSundayLeagueColor, getSundayLeagueDivisionLogoSrc, type SundayLeagueDivision } from "@/lib/sunday-league";
import { supabase } from "@/lib/supabase/client";
import type { SundayLeagueLeaderboard, SundayLeagueScheduleWeek, SundayLeagueTeam, SundayLeagueTeamMember } from "@/lib/supabase/types";

type AgreementKey =
  | "captain_confirmed"
  | "deposit_required"
  | "balance_due"
  | "approval_not_guaranteed"
  | "rules_accepted";

const agreementOptions: Array<{ key: AgreementKey; label: string }> = [
  { key: "captain_confirmed", label: "I confirm that I am the captain or authorized manager of this team." },
  { key: "deposit_required", label: "I understand a $100 deposit is required to reserve my team’s spot." },
  { key: "balance_due", label: "I understand the remaining balance is due on the first Sunday of the season." },
  {
    key: "approval_not_guaranteed",
    label: "I understand that creating a team does not guarantee final approval until payment and league requirements are completed.",
  },
  { key: "rules_accepted", label: "I agree to the Aldrich Sunday League rules, roster policies, and captain responsibilities." },
];

type TeamPortalFormState = {
  captain_name: string;
  team_name: string;
  captain_phone: string;
  captain_email: string;
  captain_is_playing: boolean;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  preferred_jersey_design: string;
  logo_description: string;
  jersey_numbers: string[];
  agreements: Record<AgreementKey, boolean>;
};

type TeamRosterPlayer = {
  id: string;
  name: string;
  position: string | null;
  avatarUrl: string | null;
  countryCode: string | null;
  jerseyNumber: string | null;
};

type TeamMemberProfile = {
  id: string;
  name: string | null;
  avatar_url: string | null;
  country_code: string | null;
  positions: string[] | null;
};

type InviteSearchProfile = Pick<TeamMemberProfile, "id" | "name" | "avatar_url" | "positions">;

type TeamMemberRecord = SundayLeagueTeamMember & {
  displayName: string;
  position: string | null;
};
type ActionState = { type: "idle" | "loading" | "success" | "error"; message?: string };

const createTeamPortalFormState = (team: SundayLeagueTeam): TeamPortalFormState => ({
  captain_name: team.captain_name ?? "",
  team_name: team.team_name ?? "",
  captain_phone: team.captain_phone ?? "",
  captain_email: team.captain_email ?? "",
  captain_is_playing: Boolean(team.captain_is_playing),
  primary_color: getSundayLeagueColor(team.preferred_jersey_colors, "primary"),
  secondary_color: getSundayLeagueColor(team.preferred_jersey_colors, "secondary"),
  accent_color: getSundayLeagueColor(team.preferred_jersey_colors, "accent"),
  preferred_jersey_design: team.preferred_jersey_design ?? "",
  logo_description: team.logo_description ?? "",
  jersey_numbers: Array.from({ length: 10 }, (_, index) => team.jersey_numbers?.[index] ?? ""),
  agreements: {
    captain_confirmed: Boolean(team.agreements && typeof team.agreements === "object" && !Array.isArray(team.agreements) && team.agreements.captain_confirmed),
    deposit_required: Boolean(team.agreements && typeof team.agreements === "object" && !Array.isArray(team.agreements) && team.agreements.deposit_required),
    balance_due: Boolean(team.agreements && typeof team.agreements === "object" && !Array.isArray(team.agreements) && team.agreements.balance_due),
    approval_not_guaranteed: Boolean(team.agreements && typeof team.agreements === "object" && !Array.isArray(team.agreements) && team.agreements.approval_not_guaranteed),
    rules_accepted: Boolean(team.agreements && typeof team.agreements === "object" && !Array.isArray(team.agreements) && team.agreements.rules_accepted),
  },
});

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

export default function SundayLeagueTeamPortalPage() {
  const params = useParams<{ teamId: string }>();
  const router = useRouter();
  const teamId = params.teamId;
  const [team, setTeam] = useState<SundayLeagueTeam | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [viewerMembership, setViewerMembership] = useState<SundayLeagueTeamMember | null>(null);
  const [scheduleWeeks, setScheduleWeeks] = useState<SundayLeagueScheduleWeek[]>([]);
  const [rosterPlayers, setRosterPlayers] = useState<TeamRosterPlayer[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRecord[]>([]);
  const [record, setRecord] = useState<Pick<SundayLeagueLeaderboard, "wins" | "draws" | "losses">>({ wins: 0, draws: 0, losses: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "no-session">("loading");
  const [isEditing, setIsEditing] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showJoinRequests, setShowJoinRequests] = useState(false);
  const [saveState, setSaveState] = useState<{ type: "idle" | "loading" | "success" | "error"; message?: string }>({ type: "idle" });
  const [inviteSuggestions, setInviteSuggestions] = useState<InviteSearchProfile[]>([]);
  const [inviteSuggestionsLoading, setInviteSuggestionsLoading] = useState(false);
  const [inviteState, setInviteState] = useState<{ type: "idle" | "loading" | "success" | "error"; message?: string }>({ type: "idle" });
  const [memberActionStates, setMemberActionStates] = useState<Record<string, { type: "idle" | "loading" | "success" | "error"; message?: string }>>({});
  const [leadershipStates, setLeadershipStates] = useState<Record<string, { type: "idle" | "loading" | "success" | "error"; message?: string }>>({});
  const [leaveState, setLeaveState] = useState<ActionState>({ type: "idle" });
  const [form, setForm] = useState<TeamPortalFormState | null>(null);
  const [teamLogoFile, setTeamLogoFile] = useState<File | null>(null);

  useEffect(() => {
    const loadTeamRoster = async (nextTeam: SundayLeagueTeam) => {
      if (!supabase) return;

      const { data: memberData } = await supabase
        .from("sunday_league_team_members")
        .select("*")
        .eq("team_id", nextTeam.id)
        .order("created_at", { ascending: true });

      const members = (memberData ?? []) as SundayLeagueTeamMember[];
      const acceptedMembers = members.filter((member) => member.status === "accepted" && member.player_user_id);
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
          .select("id,name,avatar_url,country_code,positions")
          .in("id", Array.from(profileIds));

        for (const profile of (profileData ?? []) as TeamMemberProfile[]) {
          profileMap.set(profile.id, profile);
        }
      }

      const nextRosterPlayers: TeamRosterPlayer[] = [];
      const jerseyNumbers = nextTeam.jersey_numbers ?? [];

      if (nextTeam.captain_is_playing) {
        const captainProfile = profileMap.get(nextTeam.user_id);
        nextRosterPlayers.push({
          id: nextTeam.user_id,
          name: captainProfile?.name?.trim() || nextTeam.captain_name,
          position: Array.isArray(captainProfile?.positions) ? captainProfile.positions[0] ?? null : null,
          avatarUrl: captainProfile?.avatar_url ?? null,
          countryCode: captainProfile?.country_code?.trim()?.toUpperCase() ?? null,
          jerseyNumber: jerseyNumbers[0]?.trim() || null,
        });
      }

      acceptedMembers
        .filter((member) => member.player_user_id && member.player_user_id !== nextTeam.user_id)
        .forEach((member, index) => {
          const profile = profileMap.get(member.player_user_id as string);
          nextRosterPlayers.push({
            id: member.id,
            name: profile?.name?.trim() || member.invite_name?.trim() || "Player",
            position: Array.isArray(profile?.positions) ? profile.positions[0] ?? null : null,
            avatarUrl: profile?.avatar_url ?? null,
            countryCode: profile?.country_code?.trim()?.toUpperCase() ?? null,
            jerseyNumber: jerseyNumbers[index + (nextTeam.captain_is_playing ? 1 : 0)]?.trim() || null,
          });
        });

      setRosterPlayers(nextRosterPlayers);
      setTeamMembers(
        members.map((member) => {
          const profile = member.player_user_id ? profileMap.get(member.player_user_id) : undefined;
          return {
            ...member,
            displayName: profile?.name?.trim() || member.invite_name?.trim() || member.invite_email?.trim() || "Player",
            position: Array.isArray(profile?.positions) ? profile.positions[0] ?? null : null,
          };
        }),
      );
    };

    const loadTeam = async () => {
      if (!supabase || !teamId) {
        setStatus("error");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        setStatus("no-session");
        return;
      }
      setCurrentUserId(userId);

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
      if (nextTeam.user_id !== userId) {
        const { data: roleData } = await supabase
          .from("sunday_league_team_members")
          .select("*")
          .eq("team_id", nextTeam.id)
          .eq("player_user_id", userId)
          .eq("status", "accepted")
          .eq("role", "co_captain")
          .maybeSingle();

        if (!roleData) {
          setStatus("error");
          return;
        }

        setViewerMembership(roleData as SundayLeagueTeamMember);
      } else {
        setViewerMembership(null);
      }

      setTeam(nextTeam);
      setForm(createTeamPortalFormState(nextTeam));
      const { data: leaderboardData } = await supabase
        .from("sunday_league_leaderboard")
        .select("wins,draws,losses")
        .eq("team_id", nextTeam.id)
        .maybeSingle();
      setRecord({
        wins: leaderboardData?.wins ?? 0,
        draws: leaderboardData?.draws ?? 0,
        losses: leaderboardData?.losses ?? 0,
      });
      await loadTeamRoster(nextTeam);
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
  const pendingJoinRequests = useMemo(
    () => teamMembers.filter((member) => member.status === "pending" && member.source === "player_request"),
    [teamMembers],
  );
  const pendingInvites = useMemo(
    () => teamMembers.filter((member) => member.status === "pending" && member.source === "captain_invite"),
    [teamMembers],
  );
  const acceptedLeadershipCandidates = useMemo(
    () => teamMembers.filter((member) => member.status === "accepted" && Boolean(member.player_user_id) && member.player_user_id !== team?.user_id),
    [team?.user_id, teamMembers],
  );
  const currentCoCaptain = useMemo(
    () => acceptedLeadershipCandidates.find((member) => member.role === "co_captain") ?? null,
    [acceptedLeadershipCandidates],
  );
  const viewerIsCaptain = useMemo(
    () => Boolean(team && currentUserId && team.user_id === currentUserId),
    [currentUserId, team],
  );
  const canLeaveTeam = useMemo(
    () => Boolean(team && currentUserId && viewerMembership && !viewerIsCaptain),
    [currentUserId, team, viewerIsCaptain, viewerMembership],
  );
  const inviteablePlayerIds = useMemo(() => {
    const blockedIds = new Set<string>();
    if (team) {
      blockedIds.add(team.user_id);
    }

    for (const member of teamMembers) {
      if (!member.player_user_id) continue;
      if (member.status === "accepted" || member.status === "pending") {
        blockedIds.add(member.player_user_id);
      }
    }

    return blockedIds;
  }, [team, teamMembers]);

  const updateForm = <Key extends keyof TeamPortalFormState>(key: Key, value: TeamPortalFormState[Key]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const updateAgreement = (key: AgreementKey, value: boolean) => {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            agreements: {
              ...prev.agreements,
              [key]: value,
            },
          }
        : prev,
    );
  };

  const updateJerseyNumber = (index: number, value: string) => {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            jersey_numbers: prev.jersey_numbers.map((entry, entryIndex) => (entryIndex === index ? value : entry)),
          }
        : prev,
    );
  };

  const reloadTeamMembers = async (nextTeam?: SundayLeagueTeam | null) => {
    if (!supabase || !nextTeam) return;

    const { data: memberData } = await supabase
      .from("sunday_league_team_members")
      .select("*")
      .eq("team_id", nextTeam.id)
      .order("created_at", { ascending: true });

    const members = (memberData ?? []) as SundayLeagueTeamMember[];
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
        .select("id,name,avatar_url,country_code,positions")
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
        name: captainProfile?.name?.trim() || nextTeam.captain_name,
        position: Array.isArray(captainProfile?.positions) ? captainProfile.positions[0] ?? null : null,
        avatarUrl: captainProfile?.avatar_url ?? null,
        countryCode: captainProfile?.country_code?.trim()?.toUpperCase() ?? null,
        jerseyNumber: nextTeam.jersey_numbers?.[0]?.trim() || null,
      });
    }

    members
      .filter((member) => member.status === "accepted" && member.player_user_id && member.player_user_id !== nextTeam.user_id)
      .forEach((member, index) => {
        const profile = profileMap.get(member.player_user_id as string);
        nextRosterPlayers.push({
          id: member.id,
          name: profile?.name?.trim() || member.invite_name?.trim() || "Player",
          position: Array.isArray(profile?.positions) ? profile.positions[0] ?? null : null,
          avatarUrl: profile?.avatar_url ?? null,
          countryCode: profile?.country_code?.trim()?.toUpperCase() ?? null,
          jerseyNumber: nextTeam.jersey_numbers?.[index + (nextTeam.captain_is_playing ? 1 : 0)]?.trim() || null,
        });
      });

    setRosterPlayers(nextRosterPlayers);
    setTeamMembers(
      members.map((member) => {
        const profile = member.player_user_id ? profileMap.get(member.player_user_id) : undefined;
        return {
          ...member,
          displayName: profile?.name?.trim() || member.invite_name?.trim() || member.invite_email?.trim() || "Player",
          position: Array.isArray(profile?.positions) ? profile.positions[0] ?? null : null,
        };
      }),
    );
  };

  const handleSetCoCaptain = async (member: TeamMemberRecord | null, actionKey = member?.id ?? "co-captain") => {
    if (!supabase || !team || !viewerIsCaptain) return;
    setLeadershipStates((prev) => ({ ...prev, [actionKey]: { type: "loading" } }));

    const { error: clearError } = await supabase
      .from("sunday_league_team_members")
      .update({ role: "player" })
      .eq("team_id", team.id)
      .eq("status", "accepted")
      .eq("role", "co_captain");

    if (clearError) {
      setLeadershipStates((prev) => ({ ...prev, [actionKey]: { type: "error", message: clearError.message } }));
      return;
    }

    if (member) {
      const { error: assignError } = await supabase
        .from("sunday_league_team_members")
        .update({ role: "co_captain" })
        .eq("id", member.id);

      if (assignError) {
        setLeadershipStates((prev) => ({ ...prev, [actionKey]: { type: "error", message: assignError.message } }));
        return;
      }
    }

    await reloadTeamMembers(team);
    setLeadershipStates((prev) => ({
      ...prev,
      [actionKey]: {
        type: "success",
        message: member ? `${member.displayName} is now the co-captain.` : "Co-captain removed.",
      },
    }));
  };

  const handleLeaveTeam = async () => {
    if (!supabase || !team || !currentUserId || !viewerMembership || viewerIsCaptain) return;

    const confirmMessage =
      viewerMembership.role === "co_captain"
        ? `Leave ${team.team_name} and remove your co-captain access?`
        : `Leave ${team.team_name}?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setLeaveState({ type: "loading" });

    const { error } = await supabase
      .from("sunday_league_team_members")
      .delete()
      .eq("id", viewerMembership.id)
      .eq("player_user_id", currentUserId);

    if (error) {
      setLeaveState({ type: "error", message: error.message });
      return;
    }

    setLeaveState({
      type: "success",
      message: viewerMembership.role === "co_captain" ? "You left the team and no longer have co-captain access." : "You left the team.",
    });
    router.push(`/leagues/sunday-league/teams/${team.id}`);
    router.refresh();
  };

  const handleSave = async () => {
    if (!supabase || !team || !form) return;

    if (
      !form.captain_name.trim() ||
      !form.team_name.trim() ||
      !form.captain_phone.trim() ||
      !form.captain_email.trim() ||
      !form.primary_color.trim() ||
      !form.secondary_color.trim() ||
      !form.preferred_jersey_design.trim()
    ) {
      setSaveState({ type: "error", message: "Complete all required captain, team, and jersey fields before saving." });
      return;
    }

    if (form.jersey_numbers.some((value) => !value.trim())) {
      setSaveState({ type: "error", message: "Enter all 10 included jersey numbers." });
      return;
    }

    if (agreementOptions.some((agreement) => !form.agreements[agreement.key])) {
      setSaveState({ type: "error", message: "All captain agreements must remain accepted." });
      return;
    }

    setSaveState({ type: "loading" });

    let teamLogoUrl = team.team_logo_url ?? null;
    if (teamLogoFile) {
      const uploadPath = `sunday-league/${team.user_id}/${createId()}-${teamLogoFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage.from("signups").upload(uploadPath, teamLogoFile, {
        cacheControl: "3600",
        upsert: false,
      });

      if (uploadError) {
        setSaveState({ type: "error", message: `Logo upload failed: ${uploadError.message}` });
        return;
      }

      teamLogoUrl = uploadData?.path ?? uploadPath;
    }

    const payload = {
      captain_name: form.captain_name.trim(),
      team_name: form.team_name.trim(),
      captain_phone: form.captain_phone.trim(),
      captain_email: form.captain_email.trim(),
      captain_is_playing: form.captain_is_playing,
      preferred_jersey_colors: {
        primary: form.primary_color.trim(),
        secondary: form.secondary_color.trim(),
        accent: form.accent_color.trim() || null,
      },
      preferred_jersey_design: form.preferred_jersey_design.trim(),
      team_logo_url: teamLogoUrl,
      logo_description: form.logo_description.trim() || null,
      jersey_numbers: form.jersey_numbers.map((value) => value.trim()),
      agreements: form.agreements,
    };

    const { data, error } = await supabase
      .from("sunday_league_teams")
      .update(payload)
      .eq("id", team.id)
      .eq("user_id", team.user_id)
      .select("*")
      .single();

    if (error || !data) {
      setSaveState({ type: "error", message: error?.message ?? "Could not save team changes." });
      return;
    }

    const nextTeam = data as SundayLeagueTeam;
    setTeam(nextTeam);
    setForm(createTeamPortalFormState(nextTeam));
    setTeamLogoFile(null);
    setIsEditing(false);
    setSaveState({ type: "success", message: "Team details updated." });
    await reloadTeamMembers(nextTeam);
  };

  useEffect(() => {
    const loadInviteSuggestions = async () => {
      if (!supabase || !team || !showInviteModal) {
        setInviteSuggestions([]);
        return;
      }

      setInviteSuggestionsLoading(true);
      const [profilesResponse, teamsResponse, acceptedMembersResponse] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,name,avatar_url,positions")
          .order("name", { ascending: true })
          .limit(100),
        supabase.from("sunday_league_teams").select("user_id"),
        supabase
          .from("sunday_league_team_members")
          .select("player_user_id,status")
          .eq("status", "accepted"),
      ]);

      if (profilesResponse.error || !profilesResponse.data) {
        setInviteSuggestions([]);
        setInviteSuggestionsLoading(false);
        return;
      }

      const unavailableIds = new Set<string>(inviteablePlayerIds);

      for (const captain of (teamsResponse.data ?? []) as Array<{ user_id: string }>) {
        if (captain.user_id) {
          unavailableIds.add(captain.user_id);
        }
      }

      for (const member of (acceptedMembersResponse.data ?? []) as Array<{ player_user_id?: string | null }>) {
        if (member.player_user_id) {
          unavailableIds.add(member.player_user_id);
        }
      }

      setInviteSuggestions(
        (profilesResponse.data as InviteSearchProfile[]).filter((profile) => !unavailableIds.has(profile.id)),
      );
      setInviteSuggestionsLoading(false);
    };

    void loadInviteSuggestions();
  }, [inviteablePlayerIds, showInviteModal, team]);

  const handleInvitePlayer = async (profile: InviteSearchProfile) => {
    if (!supabase || !team) return;

    const playerName = profile.name?.trim() || "Player";
    const existingInvite = teamMembers.find((member) => member.player_user_id === profile.id) ?? null;
    setInviteState({ type: "loading" });

    const response = existingInvite
      ? await supabase
          .from("sunday_league_team_members")
          .update({
            player_user_id: profile.id,
            invite_email: null,
            invite_name: playerName,
            source: "captain_invite",
            status: "pending",
          })
          .eq("id", existingInvite.id)
          .select("*")
          .single()
      : await supabase
          .from("sunday_league_team_members")
          .insert({
            team_id: team.id,
            player_user_id: profile.id,
            invite_email: null,
            invite_name: playerName,
            source: "captain_invite",
            status: "pending",
          })
          .select("*")
          .single();

    if (response.error || !response.data) {
      setInviteState({ type: "error", message: response.error?.message ?? "Could not send the invite." });
      return;
    }

    await reloadTeamMembers(team);
    setInviteSuggestions((prev) => prev.filter((entry) => entry.id !== profile.id));
    setInviteState({ type: "success", message: `${playerName} was invited. They can accept it from their Team page.` });
  };

  const handleMemberStatusChange = async (member: TeamMemberRecord, nextStatus: "accepted" | "declined") => {
    if (!supabase || !team) return;

    if (nextStatus === "accepted" && !member.player_user_id) {
      setMemberActionStates((prev) => ({
        ...prev,
        [member.id]: { type: "error", message: "That player must have an account before you can approve them." },
      }));
      return;
    }

    setMemberActionStates((prev) => ({ ...prev, [member.id]: { type: "loading" } }));

    if (nextStatus === "accepted" && member.player_user_id) {
      const { data: acceptedConflict } = await supabase
        .from("sunday_league_team_members")
        .select("id")
        .eq("player_user_id", member.player_user_id)
        .eq("status", "accepted")
        .neq("id", member.id)
        .limit(1);

      if ((acceptedConflict ?? []).length > 0) {
        setMemberActionStates((prev) => ({
          ...prev,
          [member.id]: { type: "error", message: "That player is already on another Sunday League team." },
        }));
        return;
      }
    }

    const { error } = await supabase
      .from("sunday_league_team_members")
      .update({ status: nextStatus })
      .eq("id", member.id);

    if (error) {
      setMemberActionStates((prev) => ({
        ...prev,
        [member.id]: { type: "error", message: error.message },
      }));
      return;
    }

    await reloadTeamMembers(team);
    setMemberActionStates((prev) => ({
      ...prev,
      [member.id]: {
        type: "success",
        message: nextStatus === "accepted" ? "Player approved." : member.source === "captain_invite" ? "Invite removed." : "Request declined.",
      },
    }));
  };

  return (
    <PageShell>
      <div style={{ paddingTop: 16 }}>
        <HistoryBackButton label="← Back" fallbackHref="/leagues/sunday-league" />
      </div>
      <section className="section sunday-league-flow-page">
        <div className="sunday-league-team-page">
          {status === "loading" ? <p className="muted">Loading your team portal...</p> : null}
          {status === "no-session" ? <p className="form-help error">Sign in to view your team portal.</p> : null}
          {status === "error" ? <p className="form-help error">We could not load this team portal.</p> : null}

          {team ? (
            <>
              <div className="sunday-league-team-portal__heading">
                <p className="eyebrow">Your Sunday League Team</p>
                <p className="muted">Captain view for your club profile, roster board, schedule, and team history.</p>
              </div>

              <article className="sunday-league-team-board">
                <div className="sunday-league-team-board__hero">
                  <div className="sunday-league-team-board__identity">
                    <div className="sunday-league-team-board__title-row">
                      <h2>{team.team_name}</h2>
                    </div>
                    <p className="sunday-league-team-board__captain">Captain: {team.captain_name}</p>
                    {currentCoCaptain ? <p className="sunday-league-team-board__captain">Co-Captain: {currentCoCaptain.displayName}</p> : null}
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
                    ) : null}
                  </div>
                  <div className="sunday-league-team-board__logo">
                    <TeamLogoImage src={team.team_logo_url} alt="" fill sizes="220px" />
                  </div>
                </div>

                <p className="sunday-league-team-board__established">Established {establishedLabel}</p>
                <div className="sunday-league-team-board__record">
                  <span>{record.wins}</span>
                  <span>-</span>
                  <span>{record.draws}</span>
                  <span>-</span>
                  <span>{record.losses}</span>
                </div>

                <section className="sunday-league-team-board__section">
                  <div className="sunday-league-team-board__section-header">
                    <h3>Roster</h3>
                    <div className="sunday-league-team-board__section-actions">
                      <button
                        className="button ghost"
                        type="button"
                        onClick={() => {
                          if (isEditing) {
                            setForm(createTeamPortalFormState(team));
                            setIsEditing(false);
                            setSaveState({ type: "idle" });
                            return;
                          }
                          setIsEditing(true);
                        }}
                      >
                        {isEditing ? "Close Edit" : "Edit Team"}
                      </button>
                      <button className="button ghost" type="button" onClick={() => setShowInviteModal(true)}>
                        Invite Players
                      </button>
                      <button className="button ghost sunday-league-team-board__action-button" type="button" onClick={() => setShowJoinRequests((prev) => !prev)}>
                        {showJoinRequests ? "Close Requests" : "Join Requests"}
                        <span className="sunday-league-team-board__action-badge" aria-label={`${pendingJoinRequests.length} pending join requests`}>
                          {pendingJoinRequests.length}
                        </span>
                      </button>
                    </div>
                  </div>
                  {showJoinRequests ? (
                    pendingJoinRequests.length === 0 ? (
                      <p className="muted">No pending player requests right now.</p>
                    ) : (
                      <div className="sunday-league-team-board__list">
                        {pendingJoinRequests.map((member) => (
                          <div key={member.id} className="sunday-league-team-board__list-row sunday-league-team-board__request-row">
                            <div className="sunday-league-team-board__request-copy">
                              <strong>{member.displayName}</strong>
                              <span>{member.position ?? "Player"}</span>
                            </div>
                            <div className="sunday-league-team-board__request-actions">
                              <button
                                className="button primary"
                                type="button"
                                onClick={() => void handleMemberStatusChange(member, "accepted")}
                                disabled={memberActionStates[member.id]?.type === "loading"}
                              >
                                {memberActionStates[member.id]?.type === "loading" ? "Saving..." : "Approve"}
                              </button>
                              <button
                                className="button ghost"
                                type="button"
                                onClick={() => void handleMemberStatusChange(member, "declined")}
                                disabled={memberActionStates[member.id]?.type === "loading"}
                              >
                                Decline
                              </button>
                            </div>
                            {memberActionStates[member.id]?.message ? (
                              <p
                                className={`form-help ${
                                  memberActionStates[member.id]?.type === "error"
                                    ? "error"
                                    : memberActionStates[member.id]?.type === "success"
                                      ? "success"
                                      : ""
                                }`}
                              >
                                {memberActionStates[member.id]?.message}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )
                  ) : null}
                  {isEditing && acceptedLeadershipCandidates.length > 0 ? (
                    <div className="sunday-league-stack">
                      <div>
                        <p className="eyebrow">Leadership</p>
                        <p className="muted">
                          {viewerIsCaptain
                            ? "Promote an accepted roster player to co-captain."
                            : "Only the current captain can update leadership roles."}
                        </p>
                      </div>
                      <div className="sunday-league-team-board__list">
                        {acceptedLeadershipCandidates.map((member) => (
                          <div key={member.id} className="sunday-league-team-board__list-row sunday-league-team-board__request-row">
                            <div className="sunday-league-team-board__request-copy">
                              <strong>{member.displayName}</strong>
                              <span>{member.role === "co_captain" ? "Co-Captain" : member.position ?? "Accepted player"}</span>
                            </div>
                            {viewerIsCaptain ? (
                              <div className="sunday-league-team-board__request-actions">
                                <button
                                  className="button ghost"
                                  type="button"
                                  onClick={() => void handleSetCoCaptain(member.role === "co_captain" ? null : member, member.id)}
                                  disabled={leadershipStates[member.id]?.type === "loading"}
                                >
                                  {member.role === "co_captain" ? "Remove Co-Captain" : "Set Co-Captain"}
                                </button>
                              </div>
                            ) : null}
                            {leadershipStates[member.id]?.message ? (
                              <p
                                className={`form-help ${
                                  leadershipStates[member.id]?.type === "error"
                                    ? "error"
                                    : leadershipStates[member.id]?.type === "success"
                                      ? "success"
                                      : ""
                                }`}
                              >
                                {leadershipStates[member.id]?.message}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
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
                            <p className="sunday-league-team-board__player-name">{player.name}</p>
                            <p className="sunday-league-team-board__player-position">{player.position ?? "Player"}</p>
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
                    <p className="muted">No players have signed up for your roster yet.</p>
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

              {isEditing && form ? (
                <article className="sunday-league-flow-summary__card">
                  <h3>Edit Team</h3>
                  <div className="sunday-league-team-form">
                    <div className="sunday-league-form-grid">
                      <label className="form-control">
                        <span>Full Name</span>
                        <input value={form.captain_name} onChange={(event) => updateForm("captain_name", event.target.value)} />
                      </label>
                      <label className="form-control">
                        <span>Team Name</span>
                        <input value={form.team_name} onChange={(event) => updateForm("team_name", event.target.value)} />
                      </label>
                      <label className="form-control">
                        <span>Captain email</span>
                        <input type="email" value={form.captain_email} onChange={(event) => updateForm("captain_email", event.target.value)} />
                      </label>
                      <label className="form-control">
                        <span>Captain phone</span>
                        <input value={form.captain_phone} onChange={(event) => updateForm("captain_phone", event.target.value)} />
                      </label>
                      <label className="form-control">
                        <span>Primary jersey</span>
                        <input value={form.primary_color} onChange={(event) => updateForm("primary_color", event.target.value)} />
                      </label>
                      <label className="form-control">
                        <span>Secondary jersey</span>
                        <input value={form.secondary_color} onChange={(event) => updateForm("secondary_color", event.target.value)} />
                      </label>
                      <label className="form-control">
                        <span>Accent color</span>
                        <input value={form.accent_color} onChange={(event) => updateForm("accent_color", event.target.value)} />
                      </label>
                      <label className="form-control sunday-league-form-grid__full">
                        <span>Design/style</span>
                        <input
                          value={form.preferred_jersey_design}
                          onChange={(event) => updateForm("preferred_jersey_design", event.target.value)}
                        />
                      </label>
                      <label className="form-control">
                        <span>Upload Team Logo</span>
                        <input type="file" accept="image/*" onChange={(event) => setTeamLogoFile(event.target.files?.[0] ?? null)} />
                      </label>
                      <label className="form-control sunday-league-form-grid__full">
                        <span>Logo description</span>
                        <textarea value={form.logo_description} onChange={(event) => updateForm("logo_description", event.target.value)} rows={4} />
                      </label>
                    </div>
                    <div className="sunday-league-radio-row">
                      <button
                        type="button"
                        className={`chip${form.captain_is_playing ? "" : " chip--ghost"}`}
                        aria-pressed={form.captain_is_playing}
                        onClick={() => updateForm("captain_is_playing", true)}
                      >
                        Captain is playing
                      </button>
                      <button
                        type="button"
                        className={`chip${form.captain_is_playing ? " chip--ghost" : ""}`}
                        aria-pressed={!form.captain_is_playing}
                        onClick={() => updateForm("captain_is_playing", false)}
                      >
                        Captain is manager only
                      </button>
                    </div>
                    <div className="sunday-league-panel-box sunday-league-panel-box--compact">
                      <h3>Jersey Information</h3>
                      <div className="sunday-league-jersey-grid">
                        {form.jersey_numbers.map((number, index) => (
                          <label key={`jersey-${index + 1}`} className="form-control">
                            <span>Number {index + 1}</span>
                            <input value={number} onChange={(event) => updateJerseyNumber(index, event.target.value)} />
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="sunday-league-panel-box sunday-league-panel-box--compact">
                      <h3>Captain Agreements</h3>
                      <div className="sunday-league-checkbox-list">
                        {agreementOptions.map((agreement) => (
                          <label key={agreement.key} className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={form.agreements[agreement.key]}
                              onChange={(event) => updateAgreement(agreement.key, event.target.checked)}
                            />
                            <span>{agreement.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    {saveState.message ? (
                      <p className={`form-help ${saveState.type === "error" ? "error" : saveState.type === "success" ? "success" : ""}`}>
                        {saveState.message}
                      </p>
                    ) : null}
                    <div className="sunday-league-inline-actions sunday-league-team-portal__actions">
                      <button className="button primary" type="button" onClick={() => void handleSave()} disabled={saveState.type === "loading"}>
                        {saveState.type === "loading" ? "Saving..." : "Save Changes"}
                      </button>
                      <button
                        className="button ghost"
                        type="button"
                        onClick={() => {
                          setForm(createTeamPortalFormState(team));
                          setIsEditing(false);
                          setSaveState({ type: "idle" });
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </article>
              ) : null}
            </>
          ) : null}

          {team && showInviteModal ? (
            <div className="register-modal-backdrop" role="dialog" aria-modal="true">
              <div className="register-modal sunday-league-invite-modal">
                <div className="register-modal__header">
                  <div>
                    <p className="eyebrow">Invite Players</p>
                    <h2>Available Players</h2>
                    <p className="muted">Anyone listed here is not captaining a Sunday League team and is not already on your roster.</p>
                  </div>
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => {
                      setShowInviteModal(false);
                      setInviteState({ type: "idle" });
                    }}
                  >
                    Close
                  </button>
                </div>

                {inviteState.message ? (
                  <p className={`form-help ${inviteState.type === "error" ? "error" : inviteState.type === "success" ? "success" : ""}`}>
                    {inviteState.message}
                  </p>
                ) : null}

                {inviteSuggestionsLoading ? <p className="muted">Loading available players...</p> : null}
                {!inviteSuggestionsLoading && inviteSuggestions.length === 0 ? (
                  <p className="muted">No available players to invite right now.</p>
                ) : null}

                {!inviteSuggestionsLoading && inviteSuggestions.length > 0 ? (
                  <ul className="list list--grid sunday-league-invite-modal__list">
                    {inviteSuggestions.map((profile) => (
                      <li key={profile.id} className="team-card sunday-league-invite-modal__item">
                        <div className="team-card__logo">
                          <Image src={profile.avatar_url ?? "/avatar-placeholder.svg"} alt="" fill sizes="80px" />
                        </div>
                        <div className="team-card__info">
                          <p className="list__title">{profile.name?.trim() || "Player"}</p>
                          <p className="muted">{profile.positions?.[0] ?? "Community player"}</p>
                        </div>
                        <div className="sunday-league-invite-modal__actions">
                          <Link className="button ghost sunday-league-invite-modal__button sunday-league-invite-modal__button--ghost" href={`/profiles/${profile.id}`}>
                            View
                          </Link>
                          <button
                            className="button primary sunday-league-invite-modal__button"
                            type="button"
                            onClick={() => void handleInvitePlayer(profile)}
                            disabled={inviteState.type === "loading"}
                          >
                            {inviteState.type === "loading" ? "Inviting..." : "Invite"}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {pendingInvites.length > 0 ? (
                  <div className="register-modal__footer sunday-league-invite-modal__footer">
                    <div className="sunday-league-stack">
                      <p className="eyebrow">Pending Invites</p>
                      <div className="sunday-league-team-board__list">
                        {pendingInvites.map((member) => (
                          <div key={member.id} className="sunday-league-team-board__list-row sunday-league-team-board__request-row">
                            <div className="sunday-league-team-board__request-copy">
                              <strong>{member.displayName}</strong>
                              <span>{member.position ?? "Community player"}</span>
                            </div>
                            <div className="sunday-league-team-board__request-actions">
                              <button
                                className="button ghost"
                                type="button"
                                onClick={() => void handleMemberStatusChange(member, "declined")}
                                disabled={memberActionStates[member.id]?.type === "loading"}
                              >
                                Remove Invite
                              </button>
                            </div>
                            {memberActionStates[member.id]?.message ? (
                              <p
                                className={`form-help ${
                                  memberActionStates[member.id]?.type === "error"
                                    ? "error"
                                    : memberActionStates[member.id]?.type === "success"
                                      ? "success"
                                      : ""
                                }`}
                              >
                                {memberActionStates[member.id]?.message}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </PageShell>
  );
}
