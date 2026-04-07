import "server-only";

import { promises as fs } from "fs";
import path from "path";

import { getSupabaseServiceRole } from "@/lib/admin-route-auth";
import { normalizeSundayLeagueSignupForm, type SundayLeagueSignupForm } from "@/lib/sunday-league-signup-form";

const SUNDAY_LEAGUE_SIGNUP_FORM_SETTINGS_KEY = "sunday_league_signup_form";
const sundayLeagueSignupFormFilePath = path.join(process.cwd(), "data", "sunday-league-signup-form.json");

const readSundayLeagueSignupFormFromFile = async (): Promise<SundayLeagueSignupForm> => {
  const raw = await fs.readFile(sundayLeagueSignupFormFilePath, "utf8");
  return normalizeSundayLeagueSignupForm(JSON.parse(raw) as Partial<SundayLeagueSignupForm>);
};

export const readSundayLeagueSignupForm = async (): Promise<SundayLeagueSignupForm> => {
  const supabase = getSupabaseServiceRole();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", SUNDAY_LEAGUE_SIGNUP_FORM_SETTINGS_KEY)
        .maybeSingle();

      if (!error && data?.value) {
        return normalizeSundayLeagueSignupForm(data.value as Partial<SundayLeagueSignupForm>);
      }
    } catch {
      // Fall back to the checked-in default form when the database is unavailable.
    }
  }

  try {
    return await readSundayLeagueSignupFormFromFile();
  } catch {
    return normalizeSundayLeagueSignupForm();
  }
};

export const writeSundayLeagueSignupForm = async (value: SundayLeagueSignupForm): Promise<SundayLeagueSignupForm> => {
  const next = normalizeSundayLeagueSignupForm(value);
  const supabase = getSupabaseServiceRole();

  if (supabase) {
    const { error } = await supabase.from("app_settings").upsert(
      {
        key: SUNDAY_LEAGUE_SIGNUP_FORM_SETTINGS_KEY,
        value: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );

    if (error) {
      throw error;
    }

    return next;
  }

  await fs.mkdir(path.dirname(sundayLeagueSignupFormFilePath), { recursive: true });
  await fs.writeFile(sundayLeagueSignupFormFilePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
};
