import { createId } from "@/lib/create-id";
import type { Event, JsonValue } from "@/lib/supabase/types";

export type RegistrationFieldType = "text" | "email" | "tel" | "number" | "select" | "textarea" | "checkbox" | "file";

export type RegistrationFieldEditor = {
  id: string;
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  placeholder: string;
  optionsText: string;
  expanded: boolean;
};

type RegistrationSchemaRecord = {
  fields?: unknown;
  require_waiver?: boolean;
};

export const FIELD_TYPE_OPTIONS: RegistrationFieldType[] = [
  "text",
  "email",
  "tel",
  "number",
  "select",
  "textarea",
  "checkbox",
  "file",
];

export const slugifyRegistrationFieldName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const createEmptyRegistrationField = (): RegistrationFieldEditor => ({
  id: createId(),
  label: "",
  type: "text",
  required: false,
  placeholder: "",
  optionsText: "",
  expanded: true,
});

const isSchemaRecord = (value: unknown): value is RegistrationSchemaRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const parseRegistrationSchemaState = (
  value: Event["registration_schema"],
): Pick<{ require_waiver: boolean; registration_fields: RegistrationFieldEditor[] }, "require_waiver" | "registration_fields"> => {
  const schema = isSchemaRecord(value) ? value : null;
  const rawFields = Array.isArray(schema?.fields) ? schema.fields : Array.isArray(value) ? value : [];
  const registrationFields = rawFields.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const field = entry as Record<string, unknown>;
    const type = FIELD_TYPE_OPTIONS.includes(field.type as RegistrationFieldType)
      ? (field.type as RegistrationFieldType)
      : "text";

    return [
      {
        id: typeof field.id === "string" && field.id ? field.id : createId(),
        label: typeof field.label === "string" ? field.label : "",
        type,
        required: Boolean(field.required),
        placeholder: typeof field.placeholder === "string" ? field.placeholder : "",
        optionsText: Array.isArray(field.options)
          ? field.options.filter((option): option is string => typeof option === "string").join("\n")
          : "",
        expanded: false,
      },
    ];
  });

  return {
    require_waiver: Boolean(schema?.require_waiver),
    registration_fields: registrationFields,
  };
};

export const buildRegistrationSchema = ({
  require_waiver,
  registration_fields,
}: {
  require_waiver: boolean;
  registration_fields: RegistrationFieldEditor[];
}): JsonValue | null => {
  const fields = registration_fields
    .map((field) => {
      const label = field.label.trim();
      const name = slugifyRegistrationFieldName(label);
      if (!label || !name) return null;

      const options = field.type === "select"
        ? field.optionsText
            .split("\n")
            .map((option) => option.trim())
            .filter(Boolean)
        : undefined;

      return {
        id: field.id,
        label,
        name,
        type: field.type,
        required: field.required,
        placeholder: field.placeholder.trim() || undefined,
        options,
      };
    })
    .filter((field): field is NonNullable<typeof field> => Boolean(field));

  if (!require_waiver && fields.length === 0) {
    return null;
  }

  return {
    require_waiver,
    fields,
  };
};

export const sanitizeRegistrationSchema = (value: unknown): JsonValue | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const parsed = parseRegistrationSchemaState(value as Event["registration_schema"]);
  return buildRegistrationSchema(parsed);
};
