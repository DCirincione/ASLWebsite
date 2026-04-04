import type { Event, Sport } from "@/lib/supabase/types";

type SportSlugSource = {
  title?: string | null;
  slug?: string | null;
};

export const slugifySportValue = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const normalizeSportSlug = (sport?: SportSlugSource | null) => {
  if (!sport) return "";
  return slugifySportValue(sport.title?.trim() || sport.slug?.trim() || "");
};

const RETIRED_SPORT_IMAGE_PATHS = new Set([
  "/baseball/champst2025.jpeg",
  "/basketball/champst2025.jpeg",
  "/football/flag.jpg",
  "/golf/golf.jpg",
  "/golf/minigolf.jpg",
  "/PickleTourneyCourt6.png",
  "/run/runclub.jpg",
  "/forever5/newman5.png",
]);

export const sanitizeSportImageUrl = (value?: string | null) => {
  const normalizedValue = value?.trim();
  if (!normalizedValue || RETIRED_SPORT_IMAGE_PATHS.has(normalizedValue)) {
    return undefined;
  }
  return normalizedValue;
};

export const parseSportSectionHeaders = (value?: string[] | null) =>
  Array.isArray(value) ? value.map((entry) => entry.trim()).filter(Boolean) : [];

export const getSportSlugAliases = (sportSlug: string) => {
  const normalizedSportSlug = slugifySportValue(sportSlug);
  const aliases = new Set([normalizedSportSlug]);

  if (normalizedSportSlug === "baseball-softball") {
    aliases.add("baseball");
  }

  if (normalizedSportSlug === "baseball") {
    aliases.add("baseball-softball");
  }

  if (normalizedSportSlug === "flag-football") {
    aliases.add("football");
  }

  if (normalizedSportSlug === "football") {
    aliases.add("flag-football");
  }

  if (normalizedSportSlug === "youth-flag-football") {
    aliases.add("youth-football");
  }

  return Array.from(aliases).filter(Boolean);
};

const singularizeSectionKey = (value: string) => value.replace(/s$/, "");

export const getSportSectionKeyOptions = (label: string) => {
  const base = slugifySportValue(label);
  const options = Array.from(new Set([base, singularizeSectionKey(base)].filter(Boolean)));
  return options;
};

export type EventProgramSlugOption = {
  label: string;
  value: string;
};

const buildProgramOptions = (entries: Array<[label: string, value: string]>): EventProgramSlugOption[] =>
  entries.map(([label, value]) => ({ label, value }));

const PRESET_EVENT_PROGRAM_OPTIONS: Record<string, EventProgramSlugOption[]> = {
  baseball: buildProgramOptions([
    ["Home Run Derby", "homerun-derby"],
    ["Clinic", "baseball-clinics"],
    ["League", "baseball-league"],
    ["Tournament", "baseball-tournament"],
  ]),
  "baseball-softball": buildProgramOptions([
    ["Home Run Derby", "homerun-derby"],
    ["Clinic", "baseball-clinics"],
    ["League", "baseball-league"],
    ["Tournament", "baseball-tournament"],
  ]),
  basketball: buildProgramOptions([
    ["Clinic", "basketball-clinic"],
    ["League", "basketball-league"],
    ["Pickup", "basketball-pickup"],
    ["Tournament", "basketball-tournament"],
  ]),
  soccer: buildProgramOptions([
    ["Clinic", "soccer-clinic"],
    ["League", "soccer-league"],
    ["Pickup", "soccer-pickup"],
    ["Tournament", "soccer-tournament"],
  ]),
  "youth-soccer": buildProgramOptions([
    ["Clinic", "youth-soccer-clinic"],
    ["League", "youth-soccer-league"],
  ]),
  pickleball: buildProgramOptions([
    ["League", "pickleball-league"],
    ["Tournament", "pickleball-tournament"],
  ]),
  "mini-golf": buildProgramOptions([
    ["League", "mini-golf-league"],
    ["Tournament", "mini-golf-tournament"],
  ]),
  "flag-football": buildProgramOptions([
    ["League", "football-league"],
    ["Event", "football-event"],
  ]),
  golf: buildProgramOptions([
    ["Tournament", "golf-tournament"],
  ]),
  "run-club": buildProgramOptions([
    ["Run Club", "run-club"],
  ]),
};

const getProgramSlugPrefix = (sportSlug: string) => {
  if (sportSlug === "baseball-softball") return "baseball";
  if (sportSlug === "flag-football") return "football";
  return sportSlug;
};

export const getEventProgramSlugOptions = (sport?: Pick<Sport, "title" | "section_headers"> | null) => {
  const sportSlug = normalizeSportSlug(sport);
  if (!sportSlug) return [];

  const preset = PRESET_EVENT_PROGRAM_OPTIONS[sportSlug];
  if (preset) return preset;

  const sectionHeaders = parseSportSectionHeaders(sport?.section_headers);
  if (sectionHeaders.length > 0) {
    const prefix = getProgramSlugPrefix(sportSlug);
    return sectionHeaders.map((label) => ({
      label,
      value: `${prefix}-${getSportSectionKeyOptions(label)[0] ?? slugifySportValue(label)}`,
    }));
  }

  return [{
    label: "General Event",
    value: `${getProgramSlugPrefix(sportSlug)}-event`,
  }];
};

const resolveEventSportSlug = (
  event: Pick<Event, "sport_id" | "sport_slug" | "registration_program_slug">,
  sports: Array<Pick<Sport, "id" | "title">>
) => {
  if (event.sport_id) {
    const linkedSport = sports.find((sport) => sport.id === event.sport_id) ?? null;
    const linkedSportSlug = normalizeSportSlug(linkedSport);
    if (linkedSportSlug) {
      return linkedSportSlug;
    }
  }

  const eventSportSlug = slugifySportValue(event.sport_slug ?? "");
  if (eventSportSlug) {
    return eventSportSlug;
  }

  return slugifySportValue(event.registration_program_slug ?? "");
};

export const sportMatchesEvent = (
  event: Pick<Event, "sport_id" | "sport_slug" | "registration_program_slug">,
  sportSlug: string,
  sports: Array<Pick<Sport, "id" | "title">> = []
) => {
  const normalizedSportSlugs = getSportSlugAliases(sportSlug);
  const resolvedEventSportSlug = resolveEventSportSlug(event, sports);
  const registrationSlug = slugifySportValue(event.registration_program_slug ?? "");

  if (event.sport_id) {
    return Boolean(
      normalizedSportSlugs.length > 0 &&
        normalizedSportSlugs.some((slug) => resolvedEventSportSlug === slug)
    );
  }

  return Boolean(
    normalizedSportSlugs.length > 0 &&
      normalizedSportSlugs.some((slug) => resolvedEventSportSlug === slug || registrationSlug.startsWith(`${slug}-`))
  );
};

export const getEventSectionLabel = (
  event: Pick<Event, "registration_program_slug">,
  sportSlug: string,
  sectionHeaders: string[]
) => {
  const registrationSlug = slugifySportValue(event.registration_program_slug ?? "");
  const normalizedSportSlugs = getSportSlugAliases(sportSlug);

  if (!registrationSlug || normalizedSportSlugs.length === 0) {
    return null;
  }

  for (const label of sectionHeaders) {
    const sectionKeys = getSportSectionKeyOptions(label);
    if (
      normalizedSportSlugs.some((slug) =>
        sectionKeys.some((key) => registrationSlug.startsWith(`${slug}-${key}`))
      )
    ) {
      return label;
    }
  }

  return null;
};
