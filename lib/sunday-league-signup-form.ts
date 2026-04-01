import { ALDRICH_COMMUNICATIONS_LABEL } from "@/lib/aldrich-communications";
import { createId } from "@/lib/create-id";

export type SundayLeagueSignupFieldType =
  | "text"
  | "email"
  | "tel"
  | "number"
  | "select"
  | "textarea"
  | "checkbox"
  | "file";

export type SundayLeagueSignupField = {
  id: string;
  name: string;
  label: string;
  type: SundayLeagueSignupFieldType;
  required: boolean;
  placeholder?: string | null;
  options?: string[];
};

export type SundayLeagueSignupForm = {
  fields: SundayLeagueSignupField[];
};

export type SundayLeagueSignupFieldEditor = {
  id: string;
  name: string;
  label: string;
  type: SundayLeagueSignupFieldType;
  required: boolean;
  placeholder: string;
  optionsText: string;
  expanded: boolean;
};

export type SundayLeagueSignupFormValues = Record<string, string | boolean>;

export const SUNDAY_LEAGUE_SIGNUP_FIELD_TYPE_OPTIONS: SundayLeagueSignupFieldType[] = [
  "text",
  "email",
  "tel",
  "number",
  "select",
  "textarea",
  "checkbox",
  "file",
];

export const SUNDAY_LEAGUE_REQUIRED_SIGNUP_FIELD_NAMES = [
  "captain_name",
  "captain_phone",
  "captain_email",
  "team_name",
] as const;

const DEFAULT_FIELDS: SundayLeagueSignupField[] = [
  { id: "captain-name", name: "captain_name", label: "Full Name", type: "text", required: true, placeholder: "" },
  { id: "captain-phone", name: "captain_phone", label: "Phone Number", type: "tel", required: true, placeholder: "" },
  { id: "captain-email", name: "captain_email", label: "Email Address", type: "email", required: true, placeholder: "" },
  {
    id: "captain-is-playing",
    name: "captain_is_playing",
    label: "Yes, I am also playing on this team",
    type: "checkbox",
    required: false,
    placeholder: "",
  },
  { id: "team-name", name: "team_name", label: "Team Name", type: "text", required: true, placeholder: "" },
  { id: "primary-color", name: "primary_color", label: "Primary Color", type: "text", required: false, placeholder: "" },
  { id: "secondary-color", name: "secondary_color", label: "Secondary Color", type: "text", required: false, placeholder: "" },
  { id: "accent-color", name: "accent_color", label: "Accent Color", type: "text", required: false, placeholder: "" },
  {
    id: "preferred-jersey-design",
    name: "preferred_jersey_design",
    label: "Preferred Jersey Design / Style",
    type: "text",
    required: false,
    placeholder: "",
  },
  { id: "team-logo-url", name: "team_logo_url", label: "Upload Team Logo", type: "file", required: false, placeholder: "" },
  {
    id: "logo-description",
    name: "logo_description",
    label: "If you do not have a logo yet, describe what you want your logo to look like",
    type: "textarea",
    required: false,
    placeholder: "",
  },
  { id: "jersey-number-1", name: "jersey_number_1", label: "Jersey Number 1", type: "text", required: true, placeholder: "" },
  { id: "jersey-number-2", name: "jersey_number_2", label: "Jersey Number 2", type: "text", required: true, placeholder: "" },
  { id: "jersey-number-3", name: "jersey_number_3", label: "Jersey Number 3", type: "text", required: true, placeholder: "" },
  { id: "jersey-number-4", name: "jersey_number_4", label: "Jersey Number 4", type: "text", required: true, placeholder: "" },
  { id: "jersey-number-5", name: "jersey_number_5", label: "Jersey Number 5", type: "text", required: true, placeholder: "" },
  { id: "jersey-number-6", name: "jersey_number_6", label: "Jersey Number 6", type: "text", required: true, placeholder: "" },
  { id: "jersey-number-7", name: "jersey_number_7", label: "Jersey Number 7", type: "text", required: true, placeholder: "" },
  { id: "jersey-number-8", name: "jersey_number_8", label: "Jersey Number 8", type: "text", required: true, placeholder: "" },
  { id: "jersey-number-9", name: "jersey_number_9", label: "Jersey Number 9", type: "text", required: true, placeholder: "" },
  { id: "jersey-number-10", name: "jersey_number_10", label: "Jersey Number 10", type: "text", required: true, placeholder: "" },
  {
    id: "agreement-captain-confirmed",
    name: "agreement_captain_confirmed",
    label: "I confirm that I am the captain or authorized manager of this team.",
    type: "checkbox",
    required: true,
    placeholder: "",
  },
  {
    id: "agreement-deposit-required",
    name: "agreement_deposit_required",
    label: "I understand a $100 deposit is required to reserve my team's spot.",
    type: "checkbox",
    required: true,
    placeholder: "",
  },
  {
    id: "agreement-balance-due",
    name: "agreement_balance_due",
    label: "I understand the remaining balance is due on the first Sunday of the season.",
    type: "checkbox",
    required: true,
    placeholder: "",
  },
  {
    id: "agreement-approval-not-guaranteed",
    name: "agreement_approval_not_guaranteed",
    label: "I understand that creating a team does not guarantee final approval until payment and league requirements are completed.",
    type: "checkbox",
    required: true,
    placeholder: "",
  },
  {
    id: "agreement-rules-accepted",
    name: "agreement_rules_accepted",
    label: "I agree to the Aldrich Sunday League rules, roster policies, and captain responsibilities.",
    type: "checkbox",
    required: true,
    placeholder: "",
  },
  {
    id: "communications-opt-in",
    name: "communications_opt_in",
    label: ALDRICH_COMMUNICATIONS_LABEL,
    type: "checkbox",
    required: false,
    placeholder: "",
  },
];

export const DEFAULT_SUNDAY_LEAGUE_SIGNUP_FORM: SundayLeagueSignupForm = {
  fields: DEFAULT_FIELDS,
};

const slugifyFieldName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const getUniqueFieldName = (requestedName: string, usedNames: Set<string>, fallbackSeed: string) => {
  const baseName = slugifyFieldName(requestedName) || slugifyFieldName(fallbackSeed) || `field_${createId().replace(/-/g, "_")}`;
  let nextName = baseName;
  let suffix = 2;
  while (usedNames.has(nextName)) {
    nextName = `${baseName}_${suffix}`;
    suffix += 1;
  }
  usedNames.add(nextName);
  return nextName;
};

const normalizeField = (
  value: Partial<SundayLeagueSignupField> | null | undefined,
  index: number,
  usedNames: Set<string>,
): SundayLeagueSignupField | null => {
  if (!value || typeof value !== "object") return null;

  const label = typeof value.label === "string" ? value.label.trim() : "";
  if (!label) return null;

  const type = SUNDAY_LEAGUE_SIGNUP_FIELD_TYPE_OPTIONS.includes(value.type as SundayLeagueSignupFieldType)
    ? (value.type as SundayLeagueSignupFieldType)
    : "text";
  const name = getUniqueFieldName(
    typeof value.name === "string" ? value.name : "",
    usedNames,
    label || `field_${index + 1}`,
  );

  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id : createId(),
    name,
    label,
    type,
    required: Boolean(value.required),
    placeholder: typeof value.placeholder === "string" ? value.placeholder.trim() : "",
    options: type === "select"
      ? (Array.isArray(value.options) ? value.options : [])
          .map((option) => String(option).trim())
          .filter(Boolean)
      : [],
  };
};

export const normalizeSundayLeagueSignupForm = (value?: Partial<SundayLeagueSignupForm> | null): SundayLeagueSignupForm => {
  const rawFields = Array.isArray(value?.fields) ? value.fields : null;
  const sourceFields = rawFields ?? DEFAULT_SUNDAY_LEAGUE_SIGNUP_FORM.fields;
  const usedNames = new Set<string>();
  const fields = sourceFields.flatMap((field, index) => {
    const normalized = normalizeField(field, index, usedNames);
    return normalized ? [normalized] : [];
  });

  return { fields };
};

export const createEmptySundayLeagueSignupFieldEditor = (): SundayLeagueSignupFieldEditor => ({
  id: createId(),
  name: "",
  label: "",
  type: "text",
  required: false,
  placeholder: "",
  optionsText: "",
  expanded: true,
});

export const parseSundayLeagueSignupEditorFields = (value?: Partial<SundayLeagueSignupForm> | null): SundayLeagueSignupFieldEditor[] =>
  normalizeSundayLeagueSignupForm(value).fields.map((field) => ({
    id: field.id,
    name: field.name,
    label: field.label,
    type: field.type,
    required: field.required,
    placeholder: field.placeholder ?? "",
    optionsText: Array.isArray(field.options) ? field.options.join("\n") : "",
    expanded: false,
  }));

export const buildSundayLeagueSignupForm = (fields: SundayLeagueSignupFieldEditor[]): SundayLeagueSignupForm =>
  normalizeSundayLeagueSignupForm({
    fields: fields.map((field) => ({
      id: field.id,
      name: field.name,
      label: field.label,
      type: field.type,
      required: field.required,
      placeholder: field.placeholder,
      options: field.type === "select"
        ? field.optionsText
            .split("\n")
            .map((option) => option.trim())
            .filter(Boolean)
        : [],
    })),
  });

export const createSundayLeagueSignupFormValues = (form: SundayLeagueSignupForm): SundayLeagueSignupFormValues =>
  form.fields.reduce<SundayLeagueSignupFormValues>((acc, field) => {
    if (field.type === "checkbox") {
      acc[field.name] = field.name === "captain_is_playing" || field.name === "communications_opt_in";
      return acc;
    }

    acc[field.name] = "";
    return acc;
  }, {});
