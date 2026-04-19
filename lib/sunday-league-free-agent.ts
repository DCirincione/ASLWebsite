import type { JsonValue } from "@/lib/supabase/types";

export const SUNDAY_LEAGUE_FREE_AGENT_METADATA_KEY = "sunday_league_free_agent";

export const SUNDAY_LEAGUE_POSITION_GROUP_OPTIONS = ["GK", "Defender", "Midfielder", "Attacker"] as const;
export const SUNDAY_LEAGUE_SKILL_LEVEL_OPTIONS = ["Beginner", "Intermediate", "Advanced", "High Level"] as const;
export const SUNDAY_LEAGUE_EXPERIENCE_LEVEL_OPTIONS = ["Rec", "Travel", "High School", "College", "Other"] as const;
export const SUNDAY_LEAGUE_AVAILABILITY_OPTIONS = ["Yes", "No", "Some Sundays"] as const;
export const SUNDAY_LEAGUE_DOMINANT_FOOT_OPTIONS = ["Right", "Left", "Both"] as const;

export type SundayLeaguePositionGroup = (typeof SUNDAY_LEAGUE_POSITION_GROUP_OPTIONS)[number];
export type SundayLeagueSkillLevelLabel = (typeof SUNDAY_LEAGUE_SKILL_LEVEL_OPTIONS)[number];
export type SundayLeagueExperienceLevel = (typeof SUNDAY_LEAGUE_EXPERIENCE_LEVEL_OPTIONS)[number];
export type SundayLeagueAvailability = (typeof SUNDAY_LEAGUE_AVAILABILITY_OPTIONS)[number];
export type SundayLeagueDominantFoot = (typeof SUNDAY_LEAGUE_DOMINANT_FOOT_OPTIONS)[number];

export type SundayLeagueFreeAgentMetadata = {
  age?: string | null;
  phone_number?: string | null;
  preferred_positions?: string | null;
  position_groups?: SundayLeaguePositionGroup[];
  secondary_position?: string | null;
  height_cm?: string | null;
  weight_lbs?: string | null;
  dominant_foot?: SundayLeagueDominantFoot | null;
  skill_level_label?: SundayLeagueSkillLevelLabel | null;
  experience_level?: SundayLeagueExperienceLevel | null;
  strengths?: string | null;
  weaknesses?: string | null;
  play_style?: string | null;
  sunday_availability?: SundayLeagueAvailability | null;
  known_conflicts?: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asTrimmedString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
};

const asOption = <T extends readonly string[]>(value: unknown, options: T): T[number] | null => {
  const normalized = asTrimmedString(value);
  if (!normalized) return null;
  return options.includes(normalized) ? (normalized as T[number]) : null;
};

const asOptionArray = <T extends readonly string[]>(value: unknown, options: T): T[number][] => {
  if (!Array.isArray(value)) return [];

  return value.reduce<T[number][]>((items, item) => {
    const normalized = asOption(item, options);
    if (normalized && !items.includes(normalized)) {
      items.push(normalized);
    }
    return items;
  }, []);
};

export const getSundayLeagueFreeAgentMetadata = (metadata: unknown): SundayLeagueFreeAgentMetadata => {
  if (!isRecord(metadata)) {
    return {};
  }

  const rawValue = metadata[SUNDAY_LEAGUE_FREE_AGENT_METADATA_KEY];
  if (!isRecord(rawValue)) {
    return {};
  }

  return {
    age: asTrimmedString(rawValue.age),
    phone_number: asTrimmedString(rawValue.phone_number),
    preferred_positions: asTrimmedString(rawValue.preferred_positions),
    position_groups: asOptionArray(rawValue.position_groups, SUNDAY_LEAGUE_POSITION_GROUP_OPTIONS),
    secondary_position: asTrimmedString(rawValue.secondary_position),
    height_cm: asTrimmedString(rawValue.height_cm),
    weight_lbs: asTrimmedString(rawValue.weight_lbs),
    dominant_foot: asOption(rawValue.dominant_foot, SUNDAY_LEAGUE_DOMINANT_FOOT_OPTIONS),
    skill_level_label: asOption(rawValue.skill_level_label, SUNDAY_LEAGUE_SKILL_LEVEL_OPTIONS),
    experience_level: asOption(rawValue.experience_level, SUNDAY_LEAGUE_EXPERIENCE_LEVEL_OPTIONS),
    strengths: asTrimmedString(rawValue.strengths),
    weaknesses: asTrimmedString(rawValue.weaknesses),
    play_style: asTrimmedString(rawValue.play_style),
    sunday_availability: asOption(rawValue.sunday_availability, SUNDAY_LEAGUE_AVAILABILITY_OPTIONS),
    known_conflicts: asTrimmedString(rawValue.known_conflicts),
  };
};

export const buildSundayLeagueFreeAgentMetadataValue = (
  value: SundayLeagueFreeAgentMetadata,
): Record<string, JsonValue | undefined> => ({
  [SUNDAY_LEAGUE_FREE_AGENT_METADATA_KEY]: {
    age: value.age ?? null,
    phone_number: value.phone_number ?? null,
    preferred_positions: value.preferred_positions ?? null,
    position_groups: value.position_groups ?? [],
    secondary_position: value.secondary_position ?? null,
    height_cm: value.height_cm ?? null,
    weight_lbs: value.weight_lbs ?? null,
    dominant_foot: value.dominant_foot ?? null,
    skill_level_label: value.skill_level_label ?? null,
    experience_level: value.experience_level ?? null,
    strengths: value.strengths ?? null,
    weaknesses: value.weaknesses ?? null,
    play_style: value.play_style ?? null,
    sunday_availability: value.sunday_availability ?? null,
    known_conflicts: value.known_conflicts ?? null,
  },
});

export const getSundayLeagueFreeAgentSkillRating = (value?: SundayLeagueSkillLevelLabel | null) => {
  switch (value) {
    case "Beginner":
      return 3;
    case "Intermediate":
      return 5;
    case "Advanced":
      return 7;
    case "High Level":
      return 9;
    default:
      return null;
  }
};

export const buildSundayLeagueFreeAgentPublicBio = (
  value: SundayLeagueFreeAgentMetadata,
  fallback?: string | null,
) => {
  const parts = [
    value.play_style ? `Play style: ${value.play_style}` : null,
    value.strengths ? `Strengths: ${value.strengths}` : null,
  ].filter((part): part is string => Boolean(part));

  if (parts.length === 0) {
    return fallback?.trim() || null;
  }

  return parts.join(" ");
};
