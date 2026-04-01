import { ALDRICH_COMMUNICATIONS_KEY } from "@/lib/aldrich-communications";
import type { JsonValue, SundayLeagueTeamInsert } from "@/lib/supabase/types";
import type { SundayLeagueSignupForm } from "@/lib/sunday-league-signup-form";
import type { SundayLeagueDivision } from "@/lib/sunday-league";

export const SUNDAY_LEAGUE_DEPOSIT_AMOUNT_CENTS = 10000;
export const SUNDAY_LEAGUE_DEPOSIT_CURRENCY = "USD";
export const SUNDAY_LEAGUE_CHECKOUT_WINDOW_MS = 30 * 60 * 1000;

export type SundayLeagueCheckoutFormValues = Record<string, string | boolean>;
export type SundayLeagueUploadedFileMap = Record<string, string | null>;

export type SundayLeagueTeamCheckoutPayload = SundayLeagueTeamInsert & {
  deposit_status: "paid";
  team_status: "pending";
};

export const isSundayLeagueDivision = (value: unknown): value is SundayLeagueDivision => value === 1 || value === 2;

export const asTrimmedString = (value: string | boolean | undefined) =>
  typeof value === "string" ? value.trim() : typeof value === "boolean" ? (value ? "Yes" : "") : "";

export const asOptionalString = (value: JsonValue | undefined) =>
  typeof value === "string" ? (value.trim() || null) : typeof value === "number" ? String(value) : null;

export const asBoolean = (value: JsonValue | undefined) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "y" || normalized === "1" || normalized === "on";
};

export const sanitizeCheckoutFormValues = (value: unknown): SundayLeagueCheckoutFormValues => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const next: SundayLeagueCheckoutFormValues = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof rawValue === "string" || typeof rawValue === "boolean") {
      next[key] = rawValue;
    }
  }
  return next;
};

export const sanitizeUploadedFileMap = (value: unknown): SundayLeagueUploadedFileMap => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const next: SundayLeagueUploadedFileMap = {};
  for (const [key, rawValue] of Object.entries(value)) {
    next[key] = typeof rawValue === "string" && rawValue.trim() ? rawValue.trim() : null;
  }
  return next;
};

export const validateSundayLeagueCheckoutInput = ({
  signupForm,
  values,
  uploadedFiles,
}: {
  signupForm: SundayLeagueSignupForm;
  values: SundayLeagueCheckoutFormValues;
  uploadedFiles: SundayLeagueUploadedFileMap;
}) => {
  for (const field of signupForm.fields) {
    if (!field.required) continue;

    if (field.type === "file") {
      if (!uploadedFiles[field.name]) return `${field.label} is required.`;
      continue;
    }

    if (field.type === "checkbox") {
      if (!Boolean(values[field.name])) return `${field.label} is required.`;
      continue;
    }

    if (!asTrimmedString(values[field.name])) return `${field.label} is required.`;
  }

  const captainName = asTrimmedString(values.captain_name);
  const captainPhone = asTrimmedString(values.captain_phone);
  const captainEmail = asTrimmedString(values.captain_email);
  const teamName = asTrimmedString(values.team_name);

  if (!captainName || !captainPhone || !captainEmail || !teamName) {
    return "The signup form is missing a required captain or team field. Add captain name, captain phone, captain email, and team name in Admin.";
  }

  return null;
};

export const buildSundayLeagueTeamCheckoutPayload = ({
  signupForm,
  userId,
  division,
  slotNumber,
  values,
  uploadedFiles,
}: {
  signupForm: SundayLeagueSignupForm;
  userId: string;
  division: SundayLeagueDivision;
  slotNumber: number;
  values: SundayLeagueCheckoutFormValues;
  uploadedFiles: SundayLeagueUploadedFileMap;
}): SundayLeagueTeamCheckoutPayload => {
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
    let fieldValue: JsonValue =
      field.type === "file"
        ? uploadedFiles[field.name] ?? null
        : field.type === "checkbox"
          ? Boolean(values[field.name])
          : asTrimmedString(values[field.name]);

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
    .map((field) => asTrimmedString(values[field.name]))
    .filter(Boolean);

  if (Object.keys(customFields).length > 0) {
    agreements.custom_fields = customFields;
  }
  agreements[ALDRICH_COMMUNICATIONS_KEY] = communicationsOptIn;

  return {
    user_id: userId,
    division,
    slot_number: slotNumber,
    captain_name: asTrimmedString(values.captain_name),
    captain_phone: asTrimmedString(values.captain_phone),
    captain_email: asTrimmedString(values.captain_email),
    captain_is_playing: captainIsPlaying,
    team_name: asTrimmedString(values.team_name),
    preferred_jersey_colors: preferredJerseyColors,
    preferred_jersey_design: preferredJerseyDesign,
    team_logo_url: teamLogoUrl,
    logo_description: logoDescription,
    jersey_numbers: jerseyNumbers,
    agreements,
    deposit_status: "paid",
    team_status: "pending",
  };
};
