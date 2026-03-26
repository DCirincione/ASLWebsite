import type { SupabaseClient } from "@supabase/supabase-js";

import type { JsonValue } from "@/lib/supabase/types";

export const ALDRICH_COMMUNICATIONS_LABEL =
  "I would like to receive updates, announcements, and promotional communications from Aldrich Sports via email";

export const ALDRICH_COMMUNICATIONS_KEY = "aldrich_communications_opt_in";

const CONTACT_MESSAGE_MARKER = /\n\n\[ALDRICH_COMMUNICATIONS_OPT_IN:(yes|no)\]$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const getAldrichCommunicationsPreferenceFromMetadata = (metadata: unknown, fallback = true) => {
  if (!isRecord(metadata) || !isRecord(metadata.settings)) return fallback;
  return typeof metadata.settings.email_community_updates === "boolean"
    ? metadata.settings.email_community_updates
    : fallback;
};

export const getAldrichCommunicationsPreferenceFromAnswers = (
  answers?: Record<string, JsonValue | undefined> | null,
  fallback = true
) => (typeof answers?.[ALDRICH_COMMUNICATIONS_KEY] === "boolean" ? answers[ALDRICH_COMMUNICATIONS_KEY] : fallback);

export const getAldrichCommunicationsPreferenceFromJson = (value: JsonValue | null | undefined, fallback = true) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  return typeof value[ALDRICH_COMMUNICATIONS_KEY] === "boolean" ? value[ALDRICH_COMMUNICATIONS_KEY] : fallback;
};

export const appendAldrichCommunicationsPreferenceToMessage = (message: string, optedIn: boolean) =>
  `${message.trim()}\n\n[ALDRICH_COMMUNICATIONS_OPT_IN:${optedIn ? "yes" : "no"}]`;

export const parseAldrichCommunicationsPreferenceFromMessage = (message?: string | null) => {
  const rawMessage = message ?? "";
  const match = rawMessage.match(CONTACT_MESSAGE_MARKER);
  if (!match) {
    return {
      message: rawMessage,
      optedIn: null as boolean | null,
    };
  }

  return {
    message: rawMessage.replace(CONTACT_MESSAGE_MARKER, "").trimEnd(),
    optedIn: match[1].toLowerCase() === "yes",
  };
};

export const syncAldrichCommunicationsPreference = async (
  client: SupabaseClient,
  optedIn: boolean
) => {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return error ?? null;

  const user = data.user;
  const currentValue = getAldrichCommunicationsPreferenceFromMetadata(user.user_metadata, true);
  if (currentValue === optedIn) return null;

  const currentSettings =
    user.user_metadata && typeof user.user_metadata === "object" && !Array.isArray(user.user_metadata.settings)
      ? ((user.user_metadata.settings ?? {}) as Record<string, JsonValue | undefined>)
      : {};

  const { error: updateError } = await client.auth.updateUser({
    data: {
      settings: {
        ...currentSettings,
        email_community_updates: optedIn,
      },
    },
  });

  return updateError ?? null;
};
