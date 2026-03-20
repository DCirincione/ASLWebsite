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

export const parseSportSectionHeaders = (value?: string[] | null) =>
  Array.isArray(value) ? value.map((entry) => entry.trim()).filter(Boolean) : [];

export const getSportSlugAliases = (sportSlug: string) => {
  const normalizedSportSlug = slugifySportValue(sportSlug);
  const aliases = new Set([normalizedSportSlug]);

  if (normalizedSportSlug === "baseball-softball") {
    aliases.add("baseball");
  }

  if (normalizedSportSlug === "flag-football") {
    aliases.add("football");
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

export const sportMatchesEvent = (event: Pick<Event, "sport_slug" | "registration_program_slug">, sportSlug: string) => {
  const normalizedSportSlugs = getSportSlugAliases(sportSlug);
  const eventSportSlug = slugifySportValue(event.sport_slug ?? "");
  const registrationSlug = slugifySportValue(event.registration_program_slug ?? "");

  return Boolean(
    normalizedSportSlugs.length > 0 &&
      normalizedSportSlugs.some((slug) => eventSportSlug === slug || registrationSlug.startsWith(`${slug}-`))
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
