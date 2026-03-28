export const isMissingDirectMessagesTableError = (message?: string | null) =>
  typeof message === "string" &&
  (message.includes("relation \"public.user_direct_messages\" does not exist") ||
    message.includes("Could not find the table 'public.user_direct_messages'") ||
    message.includes("schema cache"));
