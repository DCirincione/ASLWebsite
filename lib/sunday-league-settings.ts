import "server-only";

import { promises as fs } from "fs";
import path from "path";

import { DEFAULT_SUNDAY_LEAGUE_DEPOSIT_AMOUNT_CENTS, type SundayLeagueSettings } from "@/lib/sunday-league-settings-shared";

const sundayLeagueSettingsFilePath = path.join(process.cwd(), "data", "sunday-league-settings.json");

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

const normalizeSundayLeagueSettings = (value?: Partial<SundayLeagueSettings> | null): SundayLeagueSettings => ({
  depositAmountCents: normalizeDepositAmountCents(value?.depositAmountCents),
});

export const readSundayLeagueSettings = async (): Promise<SundayLeagueSettings> => {
  try {
    const raw = await fs.readFile(sundayLeagueSettingsFilePath, "utf8");
    return normalizeSundayLeagueSettings(JSON.parse(raw) as Partial<SundayLeagueSettings>);
  } catch {
    return normalizeSundayLeagueSettings();
  }
};

export const writeSundayLeagueSettings = async (value: SundayLeagueSettings): Promise<SundayLeagueSettings> => {
  const next = normalizeSundayLeagueSettings(value);
  await fs.mkdir(path.dirname(sundayLeagueSettingsFilePath), { recursive: true });
  await fs.writeFile(sundayLeagueSettingsFilePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
};
