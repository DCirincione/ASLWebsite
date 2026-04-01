import "server-only";

import { promises as fs } from "fs";
import path from "path";

import { normalizeSundayLeagueSignupForm, type SundayLeagueSignupForm } from "@/lib/sunday-league-signup-form";

const sundayLeagueSignupFormFilePath = path.join(process.cwd(), "data", "sunday-league-signup-form.json");

export const readSundayLeagueSignupForm = async (): Promise<SundayLeagueSignupForm> => {
  try {
    const raw = await fs.readFile(sundayLeagueSignupFormFilePath, "utf8");
    return normalizeSundayLeagueSignupForm(JSON.parse(raw) as Partial<SundayLeagueSignupForm>);
  } catch {
    return normalizeSundayLeagueSignupForm();
  }
};

export const writeSundayLeagueSignupForm = async (value: SundayLeagueSignupForm): Promise<SundayLeagueSignupForm> => {
  const next = normalizeSundayLeagueSignupForm(value);
  await fs.mkdir(path.dirname(sundayLeagueSignupFormFilePath), { recursive: true });
  await fs.writeFile(sundayLeagueSignupFormFilePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
};
