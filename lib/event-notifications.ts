import type { Event, EventSubmission } from "@/lib/supabase/types";

const ntfyTopic = process.env.NTFY_TOPIC?.trim() || "";
const ntfyTopicUrl = process.env.NTFY_TOPIC_URL?.trim() || "";
const ntfyServerUrl = process.env.NTFY_SERVER_URL?.trim() || "https://ntfy.sh";
const ntfyToken = process.env.NTFY_TOKEN?.trim() || "";
const appUrl = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || "";

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const getNtfyPublishUrl = () => {
  if (ntfyTopicUrl) return ntfyTopicUrl;
  if (!ntfyTopic) return null;
  return `${stripTrailingSlash(ntfyServerUrl)}/${encodeURIComponent(ntfyTopic)}`;
};

const formatContactLine = (submission: Pick<EventSubmission, "email" | "phone">) => {
  const parts = [submission.email, submission.phone].map((entry) => entry?.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(" | ") : "No contact details provided";
};

export const sendEventSignupNotification = async ({
  event,
  submission,
  paid = false,
}: {
  event: Pick<Event, "id" | "title" | "signup_mode">;
  submission: Pick<EventSubmission, "id" | "name" | "email" | "phone">;
  paid?: boolean;
}) => {
  const publishUrl = getNtfyPublishUrl();
  if (!publishUrl) {
    return { sent: false, skipped: true as const };
  }

  const modeLabel = event.signup_mode === "waitlist" ? "waitlist signup" : paid ? "paid signup" : "event signup";
  const lines = [
    `${submission.name} submitted a ${modeLabel}.`,
    `Event: ${event.title}`,
    `Contact: ${formatContactLine(submission)}`,
  ];

  const headers: Record<string, string> = {
    "X-Title": "New ASL event signup",
    "X-Priority": "high",
    "X-Tags": "tada",
  };

  if (ntfyToken) {
    headers.Authorization = `Bearer ${ntfyToken}`;
  }

  if (appUrl) {
    headers["X-Click"] = `${stripTrailingSlash(appUrl)}/admin`;
  }

  const response = await fetch(publishUrl, {
    method: "POST",
    headers,
    body: lines.join("\n"),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || "Could not send ntfy notification.");
  }

  return { sent: true as const, skipped: false as const };
};
