import "server-only";

import { getSupabaseServiceRole } from "@/lib/admin-route-auth";
import {
  DEFAULT_SUNDAY_LEAGUE_DEPOSIT_AMOUNT_CENTS,
  DEFAULT_OVERVIEW_PARAGRAPHS,
  DEFAULT_RULES,
  type SundayLeagueRuleSection,
  type SundayLeagueSettings,
} from "@/lib/sunday-league-settings-shared";

const SUNDAY_LEAGUE_SETTINGS_KEY = "sunday_league";

const normalizeDepositAmountCents = (value: unknown) => {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numericValue)) return DEFAULT_SUNDAY_LEAGUE_DEPOSIT_AMOUNT_CENTS;

  const nextValue = Math.round(numericValue);
  return nextValue > 0 ? nextValue : DEFAULT_SUNDAY_LEAGUE_DEPOSIT_AMOUNT_CENTS;
};

const normalizeOverviewParagraphs = (value: unknown): string[] => {
  if (!Array.isArray(value)) return DEFAULT_OVERVIEW_PARAGRAPHS;
  const items = value.map((p) => String(p).trim()).filter(Boolean);
  return items.length > 0 ? items : DEFAULT_OVERVIEW_PARAGRAPHS;
};

const normalizeRules = (value: unknown): SundayLeagueRuleSection[] => {
  if (!Array.isArray(value)) return DEFAULT_RULES;
  const sections = value
    .filter((s) => s && typeof s === "object" && typeof s.heading === "string")
    .map((s) => ({
      heading: String(s.heading).trim(),
      items: Array.isArray(s.items) ? s.items.map((i: unknown) => String(i).trim()).filter(Boolean) : [],
    }))
    .filter((s) => s.heading);
  return sections.length > 0 ? sections : DEFAULT_RULES;
};

const normalizeSundayLeagueSettings = (value?: Partial<SundayLeagueSettings> | null): SundayLeagueSettings => ({
  depositAmountCents: normalizeDepositAmountCents(value?.depositAmountCents),
  overviewParagraphs: normalizeOverviewParagraphs(value?.overviewParagraphs),
  rules: normalizeRules(value?.rules),
});

export const readSundayLeagueSettings = async (): Promise<SundayLeagueSettings> => {
  const supabase = getSupabaseServiceRole();
  if (!supabase) return normalizeSundayLeagueSettings();

  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SUNDAY_LEAGUE_SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      return normalizeSundayLeagueSettings();
    }

    const value =
      data?.value && typeof data.value === "object" && !Array.isArray(data.value)
        ? (data.value as Partial<SundayLeagueSettings>)
        : null;

    return normalizeSundayLeagueSettings(value);
  } catch {
    return normalizeSundayLeagueSettings();
  }
};

export const writeSundayLeagueSettings = async (value: SundayLeagueSettings): Promise<SundayLeagueSettings> => {
  const supabase = getSupabaseServiceRole();
  if (!supabase) {
    throw new Error("Supabase service role is not configured.");
  }

  const next = normalizeSundayLeagueSettings(value);

  const { error } = await supabase.from("app_settings").upsert(
    {
      key: SUNDAY_LEAGUE_SETTINGS_KEY,
      value: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (error) {
    throw error;
  }

  return next;
};
