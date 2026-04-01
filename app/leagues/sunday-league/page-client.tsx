"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { PageShell } from "@/components/page-shell";
import { TeamLogoImage } from "@/components/team-logo-image";
import {
  ALDRICH_COMMUNICATIONS_KEY,
  ALDRICH_COMMUNICATIONS_LABEL,
  syncAldrichCommunicationsPreference,
} from "@/lib/aldrich-communications";
import {
  createSundayLeagueSignupFormValues,
  type SundayLeagueSignupField,
  type SundayLeagueSignupForm,
  type SundayLeagueSignupFormValues,
} from "@/lib/sunday-league-signup-form";
import {
  SUNDAY_LEAGUE_DIVISIONS,
  SUNDAY_LEAGUE_SLOT_COUNT,
  findPendingFriendRequestBetweenUsers,
  getNextOpenSundayLeagueSlot,
  getSundayLeagueDivisionLogoSrc,
  isFriendRequestPairConstraintError,
  type SundayLeagueDivision,
} from "@/lib/sunday-league";
import { createId } from "@/lib/create-id";
import { supabase } from "@/lib/supabase/client";
import type { FriendRequest, JsonValue, SundayLeagueLeaderboard, SundayLeagueScheduleWeek, SundayLeagueTeam, SundayLeagueTeamMember } from "@/lib/supabase/types";

type SundayLeagueSection = "overview" | "rules" | "teams" | "leaderboards" | "schedule" | "inquiries";
type Status = { type: "idle" | "loading" | "success" | "error"; message?: string };
type LeaderboardTableRow = {
  id: string;
  team: string;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDistribution: string;
  points: number;
  gamesPlayed: number;
};

const sectionOrder: Array<{ id: SundayLeagueSection; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "rules", label: "Rules" },
  { id: "teams", label: "Teams" },
  { id: "leaderboards", label: "Leaderboards" },
  { id: "schedule", label: "Schedule" },
  { id: "inquiries", label: "Inquiries" },
];

const rules = [
  {
    heading: "Format & Structure",
    items: [
      "5v5 format: 1 goalkeeper and 4 field players.",
      "Maximum roster size is 10 players.",
      "Maximum players per matchday is 10.",
      "Minimum of 4 players required to play. Teams with 3 or fewer players forfeit.",
      "Games are XX minutes with a running clock.",
      "Each team plays XXX games per Sunday (TBD).",
      "Two fields are in use each Sunday: Field 1 (Black Sheep) and Field 2 (Magic Fountain).",
      "Teams rotate fields throughout the day.",
    ],
  },
  {
    heading: "Roster Rules",
    items: [
      "Rosters must be submitted by Sunday at 12:00 AM.",
      "Roster edits reopen Sunday at 6:00 PM.",
      "Only players on the submitted roster may play.",
      "No borrowing players from other teams.",
    ],
  },
  {
    heading: "Gameplay Rules",
    items: [
      "Kickoff is decided by coin flip, rock-paper-scissors, or mutual agreement.",
      "After a goal, possession goes to the team that was scored on.",
      "When the ball goes out of bounds, play restarts with a kick-in or goalkeeper possession. No throw-ins.",
      "Goal kicks are required from the end line. No kick-ins from the end line.",
      "The clock runs continuously unless stopped by the referee for injury or delay.",
      "Each team gets 1 timeout per game, with a maximum length of 1 minute 30 seconds.",
    ],
  },
  {
    heading: "Goalkeeper Rules",
    items: [
      "Goalkeepers may use their hands only inside the crease.",
      "The top of the crease acts as the penalty spot.",
      "Back passes are allowed, and the goalkeeper may pick up the ball.",
      "Goalkeepers have a maximum of 15 seconds of possession before releasing the ball.",
      "The goalkeeper cannot throw the ball past the half line, but may kick it anywhere.",
      "The goalkeeper may drop the ball and play with their feet.",
    ],
  },
  {
    heading: "Scoring & Mercy Rules",
    items: [
      "The game ends automatically at 7-0.",
      "Standard goals apply.",
      "Handball results in opposing-team possession awarded to the goalkeeper.",
      "A handball or foul inside the crease results in a penalty kick.",
      "The referee may award a penalty kick for any egregious foul.",
    ],
  },
  {
    heading: "Fouls & Discipline",
    items: [
      "Standard soccer foul rules apply.",
      "Slide tackles are not allowed. Sliding to intercept is allowed.",
      "First offense is a warning. Repeated offenses become fouls.",
      "Yellow and red cards are enforced.",
      "A red card removes the player for the entire day.",
      "A team plays down a player for the remainder of that game after a red card.",
      "The team may replace that player in the next game.",
      "Two red cards in a row, or 3 total red cards, results in removal from the league.",
    ],
  },
  {
    heading: "Fair Play & Authority",
    items: [
      "Referees have full authority and all decisions are final.",
      "Players must respect referees, opponents, and the flow of the game.",
      "ASL reserves the right to remove any player or team at any time.",
    ],
  },
  {
    heading: "Ball & Equipment Rules",
    items: [
      "Each field uses 2 to 3 balls.",
      "If a ball is kicked far out and no one retrieves it, the referee may stop play and issue a warning or penalty.",
      "Shin guards are encouraged but not required.",
    ],
  },
  {
    heading: "Forfeits & Attendance",
    items: [
      "Teams may play with 4 players.",
      "Teams with 3 or fewer players take an automatic forfeit.",
      "Teams may voluntarily forfeit by notifying the referee.",
      "Leaving mid-game may result in forfeits.",
    ],
  },
  {
    heading: "Liability & Requirements",
    items: [
      "All players must sign the required liability waivers, including ASL and/or parks department forms.",
    ],
  },
];

const asTrimmedString = (value: string | boolean | undefined) =>
  typeof value === "string" ? value.trim() : typeof value === "boolean" ? (value ? "Yes" : "") : "";

const asOptionalString = (value: JsonValue | undefined) =>
  typeof value === "string" ? (value.trim() || null) : typeof value === "number" ? String(value) : null;

const asBoolean = (value: JsonValue | undefined) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "y" || normalized === "1" || normalized === "on";
};

type SundayLeaguePageClientProps = {
  initialSection?: SundayLeagueSection;
  signupForm: SundayLeagueSignupForm;
};

export default function SundayLeaguePageClient({
  initialSection = "overview",
  signupForm,
}: SundayLeaguePageClientProps) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<SundayLeagueSection>(initialSection);
  const [createTeamInfoOpen, setCreateTeamInfoOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [selectedDivision, setSelectedDivision] = useState<SundayLeagueDivision>(1);
  const [overviewFlyer, setOverviewFlyer] = useState<string>("/sundayLeague/champs2025.jpeg");
  const [teams, setTeams] = useState<SundayLeagueTeam[]>([]);
  const [leaderboard, setLeaderboard] = useState<SundayLeagueLeaderboard[]>([]);
  const [scheduleWeeks, setScheduleWeeks] = useState<SundayLeagueScheduleWeek[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [myMemberships, setMyMemberships] = useState<SundayLeagueTeamMember[]>([]);
  const [joinStates, setJoinStates] = useState<Record<string, Status>>({});
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const [teamStatus, setTeamStatus] = useState<Status>({ type: "idle" });
  const [teamFiles, setTeamFiles] = useState<Record<string, File | null>>({});
  const [teamForm, setTeamForm] = useState<SundayLeagueSignupFormValues>(() => createSundayLeagueSignupFormValues(signupForm));
  const [inquiryForm, setInquiryForm] = useState({
    name: "",
    email: "",
    message: "",
    communications_opt_in: true,
  });

  const openCreateTeamInstructions = () => {
    setActiveSection("teams");
    setCreateTeamOpen(false);
    setCreateTeamInfoOpen(true);
  };

  const closeCreateTeamInstructions = () => {
    setCreateTeamInfoOpen(false);
  };

  const continueCreateTeamFlow = async () => {
    let nextUserId = userId;
    let nextUserEmail = "";

    if (!nextUserId && supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      nextUserId = sessionData.session?.user.id ?? null;
      nextUserEmail = sessionData.session?.user.email ?? "";

      if (nextUserId) {
        setUserId(nextUserId);
        setTeamForm((prev) => ({
          ...prev,
          captain_email: prev.captain_email || nextUserEmail || "",
        }));
      }
    }

    setCreateTeamInfoOpen(false);

    if (!nextUserId) {
      router.push("/account/create");
      return;
    }

    setCreateTeamOpen(true);
  };

  useEffect(() => {
    const normalize = (value?: string | null) => (value ?? "").trim().toLowerCase();
    const toFlyerCandidates = (slug?: string | null) => {
      const normalized = normalize(slug);
      if (!normalized) return [];

      const candidates = new Set<string>();
      candidates.add(normalized);
      candidates.add(`${normalized}-flyer`);

      const suffixes = ["-league", "-clinic", "-pickup", "-tournament", "-event"];
      for (const suffix of suffixes) {
        if (normalized.endsWith(suffix)) {
          const base = normalized.slice(0, -suffix.length);
          if (base) {
            candidates.add(base);
            candidates.add(`${base}-flyer`);
          }
        }
      }

      return Array.from(candidates);
    };

    const loadFlyer = async () => {
      if (!supabase) return;

      const { data, error } = await supabase.from("flyers").select("*");
      if (error || !data || data.length === 0) return;

      const rows = data as Array<{
        flyer_name?: string | null;
        flyer_image_url?: string | null;
        image_url?: string | null;
      }>;
      const candidates = toFlyerCandidates("soccer-league");
      const flyer =
        rows.find((row) => candidates.includes(normalize(row.flyer_name))) ||
        rows.find((row) => normalize(row.flyer_name) === "soccer league") ||
        null;

      const flyerUrl = flyer?.flyer_image_url?.trim() || flyer?.image_url?.trim();
      if (flyerUrl) {
        setOverviewFlyer(flyerUrl);
      }
    };

    void loadFlyer();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncHashState = () => {
      const hash = window.location.hash.replace(/^#/, "").trim().toLowerCase();

      if (hash === "join-team") {
        setActiveSection("teams");
        return;
      }

      if (hash === "create-team") {
        setActiveSection("teams");
        setCreateTeamOpen(false);
        setCreateTeamInfoOpen(true);
      }
    };

    syncHashState();
    window.addEventListener("hashchange", syncHashState);

    return () => {
      window.removeEventListener("hashchange", syncHashState);
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!supabase) {
        setLoadingTeams(false);
        setLoadingLeaderboard(false);
        setLoadingSchedule(false);
        return;
      }

      const [{ data: sessionData }, teamsResponse, leaderboardResponse, scheduleResponse] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from("sunday_league_teams").select("*").order("division", { ascending: true }).order("slot_number", { ascending: true }),
        supabase.from("sunday_league_leaderboard").select("*"),
        supabase.from("sunday_league_schedule_weeks").select("*").order("week_number", { ascending: true }),
      ]);

      const session = sessionData.session;
      const sessionUser = session?.user ?? null;
      setUserId(sessionUser?.id ?? null);
      setTeamForm((prev) => ({
        ...prev,
        captain_email: prev.captain_email || sessionUser?.email || "",
      }));

      if (sessionUser?.id) {
        const membershipResults = await Promise.all([
          supabase.from("sunday_league_team_members").select("*").eq("player_user_id", sessionUser.id),
          sessionUser.email
            ? supabase.from("sunday_league_team_members").select("*").eq("invite_email", sessionUser.email.trim().toLowerCase())
            : Promise.resolve({ data: [], error: null }),
        ]);

        const membershipMap = new Map<string, SundayLeagueTeamMember>();
        for (const result of membershipResults) {
          if (result.error || !result.data) continue;
          for (const membership of result.data as SundayLeagueTeamMember[]) {
            membershipMap.set(membership.id, membership);
          }
        }
        setMyMemberships(Array.from(membershipMap.values()));
      } else {
        setMyMemberships([]);
      }

      if (!teamsResponse.error) {
        setTeams((teamsResponse.data ?? []) as SundayLeagueTeam[]);
      }

      if (!leaderboardResponse.error) {
        setLeaderboard((leaderboardResponse.data ?? []) as SundayLeagueLeaderboard[]);
      }

      if (!scheduleResponse.error) {
        setScheduleWeeks((scheduleResponse.data ?? []) as SundayLeagueScheduleWeek[]);
      }

      setLoadingTeams(false);
      setLoadingLeaderboard(false);
      setLoadingSchedule(false);
    };

    void load();
  }, []);

  const myTeam = useMemo(
    () =>
      teams.find(
        (team) =>
          team.user_id === userId
          || myMemberships.some(
            (membership) =>
              membership.team_id === team.id
              && membership.status === "accepted"
              && membership.role === "co_captain",
          ),
      ) ?? null,
    [myMemberships, teams, userId],
  );

  const membershipByTeamId = useMemo(() => {
    const rank = { accepted: 3, pending: 2, declined: 1 } as const;
    const map = new Map<string, SundayLeagueTeamMember>();

    for (const membership of myMemberships) {
      const existing = map.get(membership.team_id);
      if (!existing || rank[membership.status] > rank[existing.status]) {
        map.set(membership.team_id, membership);
      }
    }

    return map;
  }, [myMemberships]);

  const acceptedMembership = useMemo(
    () => myMemberships.find((membership) => membership.status === "accepted") ?? null,
    [myMemberships],
  );

  const joinedTeam = useMemo(
    () => teams.find((team) => team.id === acceptedMembership?.team_id) ?? null,
    [acceptedMembership?.team_id, teams],
  );

  const divisionTeams = useMemo(
    () => teams.filter((team) => team.division === selectedDivision).sort((a, b) => a.slot_number - b.slot_number),
    [selectedDivision, teams],
  );

  const divisionCounts = useMemo(() => SUNDAY_LEAGUE_DIVISIONS, []);

  const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);

  const leaderboardRows = useMemo(
    () =>
      leaderboard
        .map((entry) => {
          const team = teamsById.get(entry.team_id);
          if (!team || team.division !== selectedDivision) return null;

          return {
            id: entry.id,
            team: team.team_name,
            wins: entry.wins,
            draws: entry.draws,
            losses: entry.losses,
            goalsFor: entry.goals_for,
            goalsAgainst: entry.goals_against,
            goalDistribution: entry.goal_distribution,
            points: entry.points,
            gamesPlayed: entry.games_played,
          };
        })
        .filter((row): row is LeaderboardTableRow => row !== null)
        .sort((a, b) => {
          const pointsDelta = b.points - a.points;
          if (pointsDelta !== 0) return pointsDelta;

          const winsDelta = b.wins - a.wins;
          if (winsDelta !== 0) return winsDelta;

          const goalDifferenceDelta = (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst);
          if (goalDifferenceDelta !== 0) return goalDifferenceDelta;

          const goalsForDelta = b.goalsFor - a.goalsFor;
          if (goalsForDelta !== 0) return goalsForDelta;

          return a.team.localeCompare(b.team);
        }),
    [leaderboard, selectedDivision, teamsById],
  );

  const renderDivisionTabs = (ariaLabel: string) => (
    <div className="sunday-league-division-tabs" role="tablist" aria-label={ariaLabel}>
      {divisionCounts.map((division) => (
        <button
          key={division.value}
          type="button"
          role="tab"
          aria-selected={selectedDivision === division.value}
          className={`sunday-league-division-tab${selectedDivision === division.value ? " is-active" : ""}`}
          onClick={() => setSelectedDivision(division.value)}
        >
          <Image
            src={getSundayLeagueDivisionLogoSrc(division.value)}
            alt={division.label}
            width={176}
            height={56}
            className="sunday-league-division-tab__image"
          />
        </button>
      ))}
    </div>
  );

  const updateInquiryForm = <Key extends keyof typeof inquiryForm>(key: Key, value: (typeof inquiryForm)[Key]) => {
    setInquiryForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateTeamForm = (fieldName: string, value: string | boolean) => {
    setTeamForm((prev) => ({ ...prev, [fieldName]: value }));
  };

  const updateTeamFile = (fieldName: string, file: File | null) => {
    setTeamFiles((prev) => ({
      ...prev,
      [fieldName]: file,
    }));
  };

  const handleInquirySubmit = async (event: FormEvent) => {
    event.preventDefault();

    try {
      const name = inquiryForm.name.trim();
      const email = inquiryForm.email.trim();
      const message = inquiryForm.message.trim();
      const communicationsOptIn = inquiryForm.communications_opt_in;

      if (!name || !email || !message) {
        setStatus({ type: "error", message: "Full Name, email, and message are required." });
        return;
      }

      setStatus({ type: "loading" });

      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          message,
          communicationsOptIn,
        }),
      });

      const json = (await response.json()) as { error?: string; message?: string; email_error?: string };

      if (!response.ok) {
        setStatus({ type: "error", message: json.error ?? json.message ?? "Could not send message." });
        return;
      }

      if (json.email_error) {
        setStatus({
          type: "error",
          message: json.email_error || json.message || "Message saved, but the email notification failed.",
        });
        return;
      }

      setStatus({ type: "success", message: json.message ?? "Message sent. We will get back to you soon." });
      setInquiryForm({ name: "", email: "", message: "", communications_opt_in: true });
    } catch {
      setStatus({ type: "error", message: "Could not send message." });
    }
  };

  const handleCreateTeam = async (event: FormEvent) => {
    event.preventDefault();

    const client = supabase;
    if (!client) {
      setTeamStatus({ type: "error", message: "Supabase is not configured." });
      return;
    }

    if (!userId) {
      router.push("/account/create");
      return;
    }

    if (myTeam) {
      setTeamStatus({ type: "error", message: "You already have a Sunday League team. Open your portal to manage it." });
      return;
    }

    for (const field of signupForm.fields) {
      if (!field.required) continue;

      if (field.type === "file") {
        if (!teamFiles[field.name]) {
          setTeamStatus({ type: "error", message: `${field.label} is required.` });
          return;
        }
        continue;
      }

      if (field.type === "checkbox") {
        if (!Boolean(teamForm[field.name])) {
          setTeamStatus({ type: "error", message: `${field.label} is required.` });
          return;
        }
        continue;
      }

      if (!asTrimmedString(teamForm[field.name])) {
        setTeamStatus({ type: "error", message: `${field.label} is required.` });
        return;
      }
    }

    const captainName = asTrimmedString(teamForm.captain_name);
    const captainPhone = asTrimmedString(teamForm.captain_phone);
    const captainEmail = asTrimmedString(teamForm.captain_email);
    const teamName = asTrimmedString(teamForm.team_name);

    if (!captainName || !captainPhone || !captainEmail || !teamName) {
      setTeamStatus({
        type: "error",
        message: "The signup form is missing a required captain or team field. Add captain name, captain phone, captain email, and team name in Admin.",
      });
      return;
    }

    const slotNumber = getNextOpenSundayLeagueSlot(teams, selectedDivision, SUNDAY_LEAGUE_SLOT_COUNT);
    if (!slotNumber) {
      setTeamStatus({ type: "error", message: `Division ${selectedDivision} is currently full.` });
      return;
    }

    setTeamStatus({ type: "loading" });

    const preferredJerseyColors: {
      primary: string | null;
      secondary: string | null;
      accent: string | null;
    } = {
      primary: null,
      secondary: null,
      accent: null,
    };
    const agreements: Record<string, JsonValue> = {
      captain_confirmed: true,
      deposit_required: true,
      balance_due: true,
      approval_not_guaranteed: true,
      rules_accepted: true,
    };
    const customFields: Record<string, JsonValue> = {};
    let captainIsPlaying = false;
    let preferredJerseyDesign: string | null = null;
    let teamLogoUrl: string | null = null;
    let logoDescription: string | null = null;
    let communicationsOptIn = true;

    for (const field of signupForm.fields) {
      let fieldValue: JsonValue = field.type === "checkbox" ? Boolean(teamForm[field.name]) : asTrimmedString(teamForm[field.name]);

      if (field.type === "file") {
        const file = teamFiles[field.name];
        if (file) {
          const uploadPath = `sunday-league/${userId}/${createId()}-${file.name}`;
          const { data, error } = await client.storage.from("signups").upload(uploadPath, file, {
            cacheControl: "3600",
            upsert: false,
          });

          if (error) {
            setTeamStatus({ type: "error", message: `${field.label} upload failed: ${error.message}` });
            return;
          }

          fieldValue = data?.path ?? uploadPath;
        } else {
          fieldValue = null;
        }
      }

      switch (field.name) {
        case "captain_is_playing":
          captainIsPlaying = asBoolean(fieldValue);
          break;
        case "primary_color":
          preferredJerseyColors.primary = asOptionalString(fieldValue);
          break;
        case "secondary_color":
          preferredJerseyColors.secondary = asOptionalString(fieldValue);
          break;
        case "accent_color":
          preferredJerseyColors.accent = asOptionalString(fieldValue);
          break;
        case "preferred_jersey_design":
          preferredJerseyDesign = asOptionalString(fieldValue);
          break;
        case "team_logo_url":
          teamLogoUrl = asOptionalString(fieldValue);
          break;
        case "logo_description":
          logoDescription = asOptionalString(fieldValue);
          break;
        case "communications_opt_in":
          communicationsOptIn = asBoolean(fieldValue);
          break;
        default:
          if (field.name.startsWith("agreement_")) {
            agreements[field.name.replace(/^agreement_/, "")] = asBoolean(fieldValue);
          } else if (fieldValue !== "" && fieldValue !== null) {
            customFields[field.name] = fieldValue;
          }
          break;
      }
    }

    const jerseyNumbers = signupForm.fields
      .filter((field) => /^jersey_number_\d+$/.test(field.name))
      .sort((a, b) => Number(a.name.replace("jersey_number_", "")) - Number(b.name.replace("jersey_number_", "")))
      .map((field) => asTrimmedString(teamForm[field.name]))
      .filter(Boolean);

    if (Object.keys(customFields).length > 0) {
      agreements.custom_fields = customFields;
    }

    agreements[ALDRICH_COMMUNICATIONS_KEY] = communicationsOptIn;

    const payload = {
      user_id: userId,
      division: selectedDivision,
      slot_number: slotNumber,
      captain_name: captainName,
      captain_phone: captainPhone,
      captain_email: captainEmail,
      captain_is_playing: captainIsPlaying,
      team_name: teamName,
      preferred_jersey_colors: preferredJerseyColors,
      preferred_jersey_design: preferredJerseyDesign,
      team_logo_url: teamLogoUrl,
      logo_description: logoDescription,
      jersey_numbers: jerseyNumbers,
      agreements,
      deposit_status: "pending" as const,
      team_status: "pending" as const,
    };

    const { data, error } = await client.from("sunday_league_teams").insert(payload).select("*").single();

    if (error || !data) {
      setTeamStatus({ type: "error", message: error?.message ?? "Could not create your team." });
      return;
    }

    const nextTeam = data as SundayLeagueTeam;
    void syncAldrichCommunicationsPreference(client, communicationsOptIn);
    setTeams((prev) => [...prev, nextTeam].sort((a, b) => (a.division - b.division) || (a.slot_number - b.slot_number)));
    setTeamStatus({ type: "success", message: "Team created. Opening your team portal." });
    setTeamForm(createSundayLeagueSignupFormValues(signupForm));
    setTeamFiles({});
    router.push(`/leagues/sunday-league/team/${nextTeam.id}`);
  };

  const handleRequestToJoin = async (team: SundayLeagueTeam) => {
    if (!supabase) {
      setJoinStates((prev) => ({
        ...prev,
        [team.id]: { type: "error", message: "Supabase is not configured." },
      }));
      return;
    }

    if (!userId) {
      router.push("/account/create");
      return;
    }

    if (myTeam) {
      setJoinStates((prev) => ({
        ...prev,
        [team.id]: { type: "error", message: "Team managers already manage their own team here." },
      }));
      return;
    }

    if (acceptedMembership && acceptedMembership.team_id !== team.id) {
      setJoinStates((prev) => ({
        ...prev,
        [team.id]: { type: "error", message: "You already belong to another Sunday League team." },
      }));
      return;
    }

    setJoinStates((prev) => ({ ...prev, [team.id]: { type: "loading" } }));

    const { data: existingFriendRequests, error: friendRequestError } = await supabase
      .from("friend_requests")
      .select("id,sender_id,receiver_id,status")
      .or(`and(sender_id.eq.${userId},receiver_id.eq.${team.user_id}),and(sender_id.eq.${team.user_id},receiver_id.eq.${userId})`);

    if (!friendRequestError) {
      const pendingFriendRequest = findPendingFriendRequestBetweenUsers(
        existingFriendRequests as FriendRequest[] | null,
        userId,
        team.user_id,
      );

      if (pendingFriendRequest) {
        setJoinStates((prev) => ({
          ...prev,
          [team.id]: {
            type: "error",
            message: "There is already a pending friend request between you and this captain. Use the team join request only, not both at once.",
          },
        }));
        return;
      }
    }

    const existingMembership = membershipByTeamId.get(team.id) ?? null;
    const payload = {
      team_id: team.id,
      player_user_id: userId,
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
      setJoinStates((prev) => ({
        ...prev,
        [team.id]: {
          type: "error",
          message: isFriendRequestPairConstraintError(response.error?.message)
            ? "A friend request already exists between you and this captain. Use the team join request only, not both at once."
            : response.error?.message ?? "Could not send your join request.",
        },
      }));
      return;
    }

    const nextMembership = response.data as SundayLeagueTeamMember;
    setMyMemberships((prev) => {
      const next = prev.filter((membership) => membership.id !== nextMembership.id);
      next.push(nextMembership);
      return next;
    });
    setJoinStates((prev) => ({
      ...prev,
      [team.id]: { type: "success", message: "Join request sent to the captain." },
    }));
  };

  const renderSignupField = (field: SundayLeagueSignupField) => {
    const fieldId = `create-team-${field.id}`;
    const currentValue = teamForm[field.name];
    const inputValue = typeof currentValue === "string" ? currentValue : "";
    const requiredLabel = field.required ? (
      <>
        {" "}
        <span className="register-required">*</span>
      </>
    ) : null;

    if (field.type === "checkbox") {
      return (
        <label key={field.id} className="checkbox-label sunday-league-form-grid__full" htmlFor={fieldId}>
          <input
            id={fieldId}
            type="checkbox"
            checked={Boolean(teamForm[field.name])}
            onChange={(event) => updateTeamForm(field.name, event.target.checked)}
          />
          <span>
            {field.label}
            {requiredLabel}
          </span>
        </label>
      );
    }

    if (field.type === "textarea") {
      return (
        <label key={field.id} className="form-control sunday-league-form-grid__full" htmlFor={fieldId}>
          <span>
            {field.label}
            {requiredLabel}
          </span>
          <textarea
            id={fieldId}
            value={inputValue}
            onChange={(event) => updateTeamForm(field.name, event.target.value)}
            rows={4}
            required={field.required}
            placeholder={field.placeholder ?? ""}
          />
        </label>
      );
    }

    if (field.type === "select") {
      return (
        <label key={field.id} className="form-control" htmlFor={fieldId}>
          <span>
            {field.label}
            {requiredLabel}
          </span>
          <select
            id={fieldId}
            value={inputValue}
            onChange={(event) => updateTeamForm(field.name, event.target.value)}
            required={field.required}
          >
            <option value="">Select an option</option>
            {(field.options ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (field.type === "file") {
      return (
        <label key={field.id} className="form-control sunday-league-form-grid__full" htmlFor={fieldId}>
          <span>
            {field.label}
            {requiredLabel}
          </span>
          <input
            id={fieldId}
            type="file"
            accept={field.name === "team_logo_url" ? "image/*" : undefined}
            onChange={(event) => updateTeamFile(field.name, event.target.files?.[0] ?? null)}
          />
        </label>
      );
    }

    return (
      <label key={field.id} className="form-control" htmlFor={fieldId}>
        <span>
          {field.label}
          {requiredLabel}
        </span>
        <input
          id={fieldId}
          type={field.type}
          value={inputValue}
          onChange={(event) => updateTeamForm(field.name, event.target.value)}
          required={field.required}
          placeholder={field.placeholder ?? ""}
        />
      </label>
    );
  };

  const renderContent = () => {
    switch (activeSection) {
      case "overview":
        return (
          <div className="sunday-league-content__grid">
            <div className="sunday-league-copy-block">
              <h2>Overview</h2>
              <p>
                Aldrich Sunday League is the regular ASL competition hub for standings, matchdays, team pages, and player info.
              </p>
              <p>
                Division 1 and Division 2 currently open with {SUNDAY_LEAGUE_SLOT_COUNT} team slots each. Open slots flip to live teams as captains sign up.
              </p>
              <p>
                Use the Teams tab to view each division, then use Create Team to reserve the next open slot and continue into your deposit and team portal flow.
              </p>
            </div>
            <div className="sunday-league-promo">
              <Image src={overviewFlyer} alt="Soccer league flyer" fill sizes="(max-width: 900px) 100vw, 420px" loading="eager" />
            </div>
          </div>
        );

      case "rules":
        return (
          <div className="sunday-league-rule-box">
            <h2>Rules</h2>
            {rules.map((ruleSection) => (
              <div key={ruleSection.heading} className="sunday-league-panel-box">
                <h3>{ruleSection.heading}</h3>
                {ruleSection.items.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            ))}
          </div>
        );

      case "teams":
        return (
          <div className="sunday-league-team-section">
              <div className="sunday-league-team-header sunday-league-team-header--spread">
                <div className="sunday-league-stack">
                  <h2>Teams</h2>
                  <p className="muted">Select a division to see which slots are already reserved and which are still open.</p>
                </div>
              {!myTeam ? (
                <button
                  className="button primary"
                  type="button"
                  onClick={() => {
                    openCreateTeamInstructions();
                  }}
                >
                  Create Team
                </button>
              ) : null}
            </div>

            {renderDivisionTabs("Sunday League divisions")}

            {loadingTeams ? <p className="muted">Loading division slots...</p> : null}

            {!loadingTeams && divisionTeams.length === 0 ? (
              <p className="muted">No teams added to this division yet.</p>
            ) : null}

            <div className="sunday-league-team-grid">
              {divisionTeams.map((team) => (
                <article key={team.id} className="sunday-league-team-card">
                  <div className="sunday-league-team-card__logo">
                    <TeamLogoImage src={team.team_logo_url} alt="" fill sizes="120px" />
                  </div>
                  <div className="sunday-league-stack">
                    <h3>{team.team_name}</h3>
                  </div>
                  <div className="sunday-league-team-card__actions">
                    <Link className="button ghost sunday-league-team-card__button" href={`/leagues/sunday-league/teams/${team.id}`}>
                      View Team
                    </Link>
                    {myTeam?.id === team.id ? null : (() => {
                      const membership = membershipByTeamId.get(team.id) ?? null;
                      const joinState = joinStates[team.id];
                      const hasOtherAcceptedTeam = Boolean(acceptedMembership && acceptedMembership.team_id !== team.id);
                      const isInvitePending = membership?.status === "pending" && membership.source === "captain_invite";
                      const isRequestPending = membership?.status === "pending" && membership.source === "player_request";

                      let label = "Request to Join";
                      let disabled = false;
                      let onClick: () => void = () => void handleRequestToJoin(team);

                      if (joinState?.type === "loading") {
                        label = "Sending...";
                        disabled = true;
                      } else if (membership?.status === "accepted") {
                        label = "On Team";
                        disabled = true;
                      } else if (isRequestPending) {
                        label = "Request Sent";
                        disabled = true;
                      } else if (isInvitePending) {
                        label = "View Invite";
                        onClick = () => router.push("/account/team");
                      } else if (hasOtherAcceptedTeam) {
                        label = "Already on a Team";
                        disabled = true;
                      } else if (!userId) {
                        onClick = () => router.push("/account/create");
                      } else if (membership?.status === "declined") {
                        label = "Request Again";
                      }

                      return (
                        <>
                          <button
                            className="button primary sunday-league-team-card__button"
                            type="button"
                            onClick={onClick}
                            disabled={disabled}
                          >
                            {label}
                          </button>
                          {joinState?.message ? (
                            <p
                              className={`form-help sunday-league-team-card__status${
                                joinState.type === "error" ? " error" : joinState.type === "success" ? " success" : ""
                              }`}
                            >
                              {joinState.message}
                            </p>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                </article>
              ))}
            </div>
          </div>
        );

      case "leaderboards":
        return (
          <div className="sunday-league-leaderboard">
            <h2>Leaderboard</h2>
            {renderDivisionTabs("Sunday League leaderboard divisions")}
            {loadingLeaderboard ? <p className="muted">Loading leaderboard...</p> : null}
            {!loadingLeaderboard && leaderboardRows.length === 0 ? (
              <p className="muted">No leaderboard rows added for this division yet.</p>
            ) : null}
            {leaderboardRows.length > 0 ? (
              <div className="sunday-league-table-wrap">
                <table className="sunday-league-table">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>W</th>
                      <th>D</th>
                      <th>L</th>
                      <th>GF</th>
                      <th>GA</th>
                      <th>GF-GA</th>
                      <th>PTS</th>
                      <th>GP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.team}</td>
                        <td>{row.wins}</td>
                        <td>{row.draws}</td>
                        <td>{row.losses}</td>
                        <td>{row.goalsFor}</td>
                        <td>{row.goalsAgainst}</td>
                        <td>{row.goalDistribution}</td>
                        <td>{row.points}</td>
                        <td>{row.gamesPlayed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        );

      case "schedule":
        return (
          <div className="sunday-league-schedule">
            <h2>Schedule</h2>
            {loadingSchedule ? <p className="muted">Loading schedule...</p> : null}
            {!loadingSchedule && scheduleWeeks.length === 0 ? (
              <p className="muted">No weekly schedule has been posted yet.</p>
            ) : null}
            {!loadingSchedule ? (
              <div className="sunday-league-schedule__weeks">
                {scheduleWeeks.map((week) => (
                  <article key={week.id} className="sunday-league-panel-box sunday-league-schedule__week">
                    <div className="sunday-league-stack">
                      <p className="eyebrow">Week {week.week_number}</p>
                      <div className="sunday-league-schedule__grid">
                        <div className="sunday-league-schedule__column">
                          <h3>Black Sheep Field</h3>
                          <p className="sunday-league-schedule__body">{week.black_sheep_field_schedule}</p>
                        </div>
                        <div className="sunday-league-schedule__column">
                          <h3>Magic Fountain Field</h3>
                          <p className="sunday-league-schedule__body">{week.magic_fountain_field_schedule}</p>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        );

      case "inquiries":
        return (
          <div className="sunday-league-inquiries">
            <h2>Inquiries</h2>
            <p className="sunday-league-inquiries__prompt">Sunday League Questions?</p>
            <form className="sunday-league-inquiries__form" onSubmit={handleInquirySubmit}>
              <label className="form-control">
                <span>Full Name</span>
                <input
                  type="text"
                  name="name"
                  placeholder="Your full name"
                  value={inquiryForm.name}
                  onChange={(event) => updateInquiryForm("name", event.target.value)}
                  required
                />
              </label>
              <label className="form-control">
                <span>Email</span>
                <input
                  type="email"
                  name="email"
                  placeholder="you@email.com"
                  value={inquiryForm.email}
                  onChange={(event) => updateInquiryForm("email", event.target.value)}
                  required
                />
              </label>
              <label className="form-control">
                <span>Message</span>
                <textarea
                  name="message"
                  placeholder="Type here..."
                  aria-label="Sunday League questions"
                  value={inquiryForm.message}
                  onChange={(event) => updateInquiryForm("message", event.target.value)}
                  required
                />
              </label>
              <div className="form-control checkbox-control" style={{ justifySelf: "start" }}>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={inquiryForm.communications_opt_in}
                    onChange={(event) => updateInquiryForm("communications_opt_in", event.target.checked)}
                  />
                  <span>{ALDRICH_COMMUNICATIONS_LABEL}</span>
                </label>
              </div>
              <div className="sunday-league-inquiries__actions">
                <button className="button primary" type="submit" disabled={status.type === "loading"}>
                  {status.type === "loading" ? "Sending..." : "Submit"}
                </button>
              </div>
              {status.message ? (
                <p className={`form-help ${status.type === "error" ? "error" : "muted"}`}>{status.message}</p>
              ) : null}
            </form>
          </div>
        );
    }
  };

  return (
    <PageShell>
      <section className="section sunday-league-page">
        <div className="sunday-league-topbar">
          <div className="sunday-league-topbar__title">
            <h1>Aldrich Sunday League</h1>
            <p className="muted">Division-based team registration, live slot tracking, and your captain portal in one place.</p>
            <div className="sunday-league-topbar__actions">
              {myTeam ? (
                <button className="button primary" type="button" onClick={() => router.push(`/leagues/sunday-league/team/${myTeam.id}`)}>
                  Your Sunday League Team
                </button>
              ) : joinedTeam ? (
                <>
                  <button className="button primary" type="button" onClick={() => router.push(`/leagues/sunday-league/teams/${joinedTeam.id}`)}>
                    Your Team Page
                  </button>
                  <button className="button ghost" type="button" onClick={() => router.push("/account/team")}>
                    Team Invites
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="button primary"
                    type="button"
                    onClick={() => {
                      if (!userId) {
                        router.push("/account/create");
                        return;
                      }
                      setActiveSection("teams");
                    }}
                  >
                    Join a Team
                  </button>
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => {
                      openCreateTeamInstructions();
                    }}
                  >
                    Create a Team
                  </button>
                </>
              )}
              {!myTeam && !joinedTeam ? (
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => {
                    if (!userId) {
                      router.push("/account/create");
                      return;
                    }
                    setActiveSection("inquiries");
                  }}
                >
                  Free Agent
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="sunday-league-layout">
          <aside className="sunday-league-sidebar" aria-label="Sunday League sections">
            {sectionOrder.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`sunday-league-sidebar__item${activeSection === section.id ? " is-active" : ""}`}
                onClick={() => setActiveSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </aside>

          <div className="sunday-league-main">
            <div className="sunday-league-main__content">{renderContent()}</div>
          </div>
        </div>

        {createTeamInfoOpen ? (
          <div className="register-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="sunday-league-create-info-title">
            <div className="register-modal sunday-league-invite-modal sunday-league-create-info-modal">
              <div className="register-modal__header">
                <div className="sunday-league-stack">
                  <p className="eyebrow">Sunday League</p>
                  <h2 id="sunday-league-create-info-title">CREATE YOUR TEAM (IMPORTANT)</h2>
                </div>
                <button className="button ghost" type="button" onClick={closeCreateTeamInstructions}>
                  Close
                </button>
              </div>

              <div className="sunday-league-create-info-modal__body">
                <div className="sunday-league-create-info-modal__section">
                  <p>Only the Manager should create the team and complete this form.</p>
                  <p>Once created, you can:</p>
                  <ul className="sunday-league-create-info-modal__list">
                    <li>Invite/accept/remove players</li>
                    <li>Edit team info + logo</li>
                    <li>Assign roles (Co-Captain)</li>
                  </ul>
                </div>

                <div className="sunday-league-create-info-modal__section">
                  <h3>TEAM HUB</h3>
                  <p>You’ll have access to:</p>
                  <ul className="sunday-league-create-info-modal__list">
                    <li>Roster, schedule, stats, standings</li>
                    <li>Team inbox/messages</li>
                  </ul>
                </div>

                <div className="sunday-league-create-info-modal__section">
                  <h3>IMPORTANT</h3>
                  <p>All players must create an account and join your team on the site.</p>
                  <p className="sunday-league-create-info-modal__closing">Get your team set up and ready. ⚽</p>
                </div>
              </div>

              <div className="register-modal__footer">
                <button className="button ghost" type="button" onClick={closeCreateTeamInstructions}>
                  Cancel
                </button>
                <button className="button primary" type="button" onClick={() => void continueCreateTeamFlow()}>
                  Accept and Continue
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {createTeamOpen ? (
          <div className="register-modal-backdrop" role="dialog" aria-modal="true">
            <div className="register-modal sunday-league-create-modal">
              <div className="register-modal__header">
                <div>
                  <p className="eyebrow">Create a Sunday League Team</p>
                  <h2>Create Your Team</h2>
                </div>
                <button className="button ghost" type="button" onClick={() => setCreateTeamOpen(false)}>
                  Close
                </button>
              </div>

              {myTeam ? (
                <div className="sunday-league-panel-box">
                  <h3>Team already created</h3>
                  <p>
                    You already reserved <strong>{myTeam.team_name}</strong> in Division {myTeam.division}, slot {myTeam.slot_number}.
                  </p>
                  <div className="sunday-league-inline-actions">
                    <button className="button primary" type="button" onClick={() => router.push(`/leagues/sunday-league/team/${myTeam.id}`)}>
                      Your Sunday League Team
                    </button>
                  </div>
                </div>
              ) : !userId ? (
                <div className="sunday-league-panel-box sunday-league-panel-box--compact">
                  <h3>Account Required</h3>
                  <p>Create an account or sign in before creating a Sunday League team.</p>
                  <div className="sunday-league-inline-actions">
                    <button className="button primary" type="button" onClick={() => router.push("/account/create")}>
                      Create Account
                    </button>
                    <button className="button ghost" type="button" onClick={() => router.push("/account/create")}>
                      Sign Up
                    </button>
                  </div>
                </div>
              ) : (
                <form className="sunday-league-team-form" onSubmit={handleCreateTeam}>
                  <div className="sunday-league-panel-box sunday-league-panel-box--compact">
                    <h3>Create a Sunday League Team</h3>
                    <p>
                      Only the team captain should complete this form. By creating a team, the captain is reserving a spot in the Aldrich Sunday League and agrees to submit the required $100 deposit. The remaining balance will be due on the first Sunday of the season. After this form is submitted, the captain will gain access to the team portal, where they can manage their roster, invite players, and update team information.
                    </p>
                    <p className="muted" style={{ marginBottom: 0 }}>
                      You are currently creating for Division {selectedDivision}.
                    </p>
                  </div>

                  <div className="sunday-league-panel-box">
                    <h3>Signup Form</h3>
                    <p className="muted">This form is managed from Admin → Sunday League.</p>
                    <div className="sunday-league-form-grid">
                      {signupForm.fields.map((field) => renderSignupField(field))}
                    </div>
                    {signupForm.fields.length === 0 ? (
                      <p className="muted" style={{ marginBottom: 0 }}>
                        No signup fields are configured yet.
                      </p>
                    ) : null}
                  </div>

                  <div className="sunday-league-form-actions">
                    {teamStatus.message ? (
                      <p className={`form-help ${teamStatus.type === "error" ? "error" : "muted"}`}>{teamStatus.message}</p>
                    ) : null}
                    <button className="button primary" type="submit" disabled={teamStatus.type === "loading"}>
                      {teamStatus.type === "loading" ? "Creating team..." : "Create Team"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </PageShell>
  );
}
