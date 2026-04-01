import type { Event, FriendRequest, JsonValue, SundayLeagueTeam } from "@/lib/supabase/types";

type SundayLeagueEventLike = Pick<Event, "title" | "description" | "registration_program_slug" | "sport_slug">;
export type SundayLeagueDivision = 1 | 2;
export type SundayLeagueSlot = {
  slotNumber: number;
  division: SundayLeagueDivision;
  team: SundayLeagueTeam | null;
};

export const SUNDAY_LEAGUE_HREF = "/leagues/sunday-league";
export const SUNDAY_LEAGUE_SLOT_COUNT = 8;
export const SUNDAY_LEAGUE_DIVISIONS: Array<{ value: SundayLeagueDivision; label: string }> = [
  { value: 1, label: "Division 1" },
  { value: 2, label: "Division 2" },
];

export const getSundayLeagueDivisionLogoSrc = (division: SundayLeagueDivision) =>
  division === 1 ? "/conferences/Conference1LogoSundayLeague.png" : "/conferences/Conference2LogoSundayLeague.png";

export const formatSundayLeaguePlayerName = (value?: string | null) => {
  const parts = value?.trim().split(/\s+/).filter(Boolean) ?? [];

  if (parts.length <= 1) {
    return {
      topLine: parts[0] ?? "",
      bottomLine: "",
    };
  }

  return {
    topLine: parts.slice(0, -1).join(" "),
    bottomLine: parts[parts.length - 1] ?? "",
  };
};

export const findPendingFriendRequestBetweenUsers = (
  requests: FriendRequest[] | null | undefined,
  firstUserId: string,
  secondUserId: string,
) =>
  requests?.find(
    (request) =>
      request.status === "pending" &&
      ((request.sender_id === firstUserId && request.receiver_id === secondUserId) ||
        (request.sender_id === secondUserId && request.receiver_id === firstUserId)),
  ) ?? null;

export const isFriendRequestPairConstraintError = (message?: string | null) =>
  (message ?? "").includes("uq_friend_requests_pair");

const normalizeValue = (value?: string | null) => value?.trim().toLowerCase() ?? "";

export const isRegularAslSundayLeagueEvent = (event?: SundayLeagueEventLike | null) => {
  if (!event) return false;

  const title = normalizeValue(event.title);
  const description = normalizeValue(event.description);
  const registrationSlug = normalizeValue(event.registration_program_slug);
  const sportSlug = normalizeValue(event.sport_slug);
  const combinedText = [title, description, registrationSlug].filter(Boolean).join(" ");

  const mentionsSundayLeague =
    combinedText.includes("sunday league") ||
    combinedText.includes("sunday-league") ||
    registrationSlug.includes("sunday");

  const isSoccerLeagueContext =
    sportSlug === "soccer" ||
    registrationSlug.startsWith("soccer-league") ||
    registrationSlug.startsWith("soccer-event") ||
    combinedText.includes("asl");

  const isJuniorVariant =
    combinedText.includes("junior") ||
    combinedText.includes("youth") ||
    combinedText.includes("kids");

  return mentionsSundayLeague && isSoccerLeagueContext && !isJuniorVariant;
};

const isRecord = (value: JsonValue | null | undefined): value is Record<string, JsonValue | undefined> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const getSundayLeagueColor = (value: JsonValue | null | undefined, key: string) => {
  if (!isRecord(value)) return "";
  const colorValue = value[key];
  return typeof colorValue === "string" ? colorValue : "";
};

export const getSundayLeagueAgreement = (value: JsonValue | null | undefined, key: string) => {
  if (!isRecord(value)) return false;
  return Boolean(value[key]);
};

export const buildSundayLeagueSlots = (
  teams: SundayLeagueTeam[],
  division: SundayLeagueDivision,
  slotCount: number = SUNDAY_LEAGUE_SLOT_COUNT,
): SundayLeagueSlot[] => {
  const teamsBySlot = new Map<number, SundayLeagueTeam>();
  for (const team of teams) {
    if (team.division === division) {
      teamsBySlot.set(team.slot_number, team);
    }
  }

  return Array.from({ length: slotCount }, (_, index) => {
    const slotNumber = index + 1;
    return {
      slotNumber,
      division,
      team: teamsBySlot.get(slotNumber) ?? null,
    };
  });
};

export const getNextOpenSundayLeagueSlot = (
  teams: SundayLeagueTeam[],
  division: SundayLeagueDivision,
  slotCount: number = SUNDAY_LEAGUE_SLOT_COUNT,
) => buildSundayLeagueSlots(teams, division, slotCount).find((slot) => !slot.team)?.slotNumber ?? null;
