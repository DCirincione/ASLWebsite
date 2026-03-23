import type { Event } from "@/lib/supabase/types";

type SundayLeagueEventLike = Pick<Event, "title" | "description" | "registration_program_slug" | "sport_slug">;

export const SUNDAY_LEAGUE_HREF = "/leagues/sunday-league";

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
