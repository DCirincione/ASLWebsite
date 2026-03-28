export type InboxAnnouncementAudience = "all_players" | "selected_players";

export const INBOX_ANNOUNCEMENT_AUDIENCE_OPTIONS: InboxAnnouncementAudience[] = [
  "all_players",
  "selected_players",
];

export const isInboxAnnouncementAudience = (value: unknown): value is InboxAnnouncementAudience =>
  typeof value === "string" && INBOX_ANNOUNCEMENT_AUDIENCE_OPTIONS.includes(value as InboxAnnouncementAudience);

export const isMissingInboxTableError = (message?: string | null) =>
  typeof message === "string" &&
  (message.includes("relation \"public.user_inbox_messages\" does not exist") ||
    message.includes("Could not find the table 'public.user_inbox_messages'") ||
    message.includes("schema cache"));
