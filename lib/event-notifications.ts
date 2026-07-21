import type { Event, EventSubmission } from "@/lib/supabase/types";

const ntfyTopic = process.env.NTFY_TOPIC?.trim() || "";
const ntfyTopicUrl = process.env.NTFY_TOPIC_URL?.trim() || "";
const ntfyServerUrl = process.env.NTFY_SERVER_URL?.trim() || "https://ntfy.sh";
const ntfyToken = process.env.NTFY_TOKEN?.trim() || "";
const appUrl = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
const resendApiKey = process.env.RESEND_API_KEY?.trim() || "";
const signupFromEmail =
  process.env.EVENT_SIGNUP_FROM_EMAIL?.trim() ||
  process.env.CONTACT_FROM_EMAIL?.trim() ||
  "";

type EventConfirmationEmailConfig = {
  subject?: string;
  body?: string;
};

type RegistrationSchemaRecord = {
  confirmation_email?: EventConfirmationEmailConfig;
};

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

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const isSchemaRecord = (value: unknown): value is RegistrationSchemaRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getConfirmationEmailConfig = (event: Pick<Event, "registration_schema">) => {
  const schema = isSchemaRecord(event.registration_schema) ? event.registration_schema : null;
  const config = schema?.confirmation_email && typeof schema.confirmation_email === "object"
    ? schema.confirmation_email
    : null;

  return {
    subject: typeof config?.subject === "string" ? config.subject.trim() : "",
    body: typeof config?.body === "string" ? config.body.trim() : "",
  };
};

const applyEmailTemplate = ({
  template,
  event,
  submission,
}: {
  template: string;
  event: Pick<Event, "title">;
  submission: Pick<EventSubmission, "name" | "email" | "phone">;
}) =>
  template
    .replaceAll("{{name}}", submission.name)
    .replaceAll("{{event_title}}", event.title)
    .replaceAll("{{email}}", submission.email)
    .replaceAll("{{phone}}", submission.phone?.trim() || "");

const getDefaultConfirmationBody = ({
  event,
  submission,
}: {
  event: Pick<Event, "title" | "signup_mode">;
  submission: Pick<EventSubmission, "name">;
}) => {
  const signupLabel = event.signup_mode === "waitlist" ? "waitlist" : "event";

  return `Hi ${submission.name},

Thank you for signing up for ${event.title}.

We received your ${signupLabel} submission and will reach out to you soon.

Aldrich Sports`;
};

const getCustomConfirmationBody = ({
  event,
  submission,
  body,
}: {
  event: Pick<Event, "title">;
  submission: Pick<EventSubmission, "name">;
  body: string;
}) => `Hi ${submission.name},

${body}

Event: ${event.title}

Aldrich Sports`;

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

export const sendEventSignupConfirmationEmail = async ({
  event,
  submission,
}: {
  event: Pick<Event, "title" | "signup_mode" | "registration_schema">;
  submission: Pick<EventSubmission, "name" | "email" | "phone">;
}) => {
  if (!resendApiKey || !signupFromEmail || !submission.email.trim()) {
    return { sent: false, skipped: true as const };
  }

  const config = getConfirmationEmailConfig(event);
  const subject = applyEmailTemplate({
    template: config.subject || `Thanks for signing up for ${event.title}`,
    event,
    submission,
  });
  const text = applyEmailTemplate({
    template: config.body
      ? getCustomConfirmationBody({ event, submission, body: config.body })
      : getDefaultConfirmationBody({ event, submission }),
    event,
    submission,
  });
  const html = text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br />")}</p>`)
    .join("");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: signupFromEmail,
      to: submission.email,
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || "Could not send event signup confirmation email.");
  }

  return { sent: true as const, skipped: false as const };
};
