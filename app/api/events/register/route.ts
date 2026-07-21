import { NextRequest, NextResponse } from "next/server";

import { getBearerToken, getSupabaseServiceRole, getSupabaseWithToken } from "@/lib/admin-route-auth";
import { isPaidEventRegistration } from "@/lib/effective-event-registrations";
import { isPublicEventVisible } from "@/lib/event-approval";
import { getSignupDuplicateMessage } from "@/lib/event-signups";
import { sendEventSignupConfirmationEmail, sendEventSignupNotification } from "@/lib/event-notifications";
import type { Event, EventSubmission, EventSubmissionInsert, JsonValue } from "@/lib/supabase/types";

export const runtime = "nodejs";

type FieldType = "text" | "email" | "tel" | "number" | "select" | "textarea" | "checkbox" | "file";

type RegistrationField = {
  label: string;
  name: string;
  type: FieldType;
  required: boolean;
};

type RegistrationSchema = {
  fields?: unknown;
  require_waiver?: boolean;
};

type EventRegistrationRequestBody = Partial<{
  eventId: string;
  name: string;
  email: string;
  phone: string;
  answers: unknown;
  attachments: unknown;
  waiverAccepted: boolean;
}>;

const isFieldType = (value: unknown): value is FieldType =>
  value === "text" ||
  value === "email" ||
  value === "tel" ||
  value === "number" ||
  value === "select" ||
  value === "textarea" ||
  value === "checkbox" ||
  value === "file";

const parseSchemaFields = (schema: JsonValue | null | undefined): RegistrationField[] => {
  const rawSchema = (schema ?? null) as RegistrationSchema | null;
  const rawFields = Array.isArray(rawSchema?.fields) ? rawSchema.fields : Array.isArray(schema) ? schema : [];

  return rawFields.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const field = entry as Record<string, unknown>;
    const name = typeof field.name === "string" ? field.name.trim() : "";
    const label = typeof field.label === "string" ? field.label.trim() : "";
    const type = isFieldType(field.type) ? field.type : "text";
    if (!name || !label) return [];

    return [{
      label,
      name,
      type,
      required: Boolean(field.required),
    }];
  });
};

const schemaRequiresWaiver = (schema: JsonValue | null | undefined) => {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return false;
  return Boolean((schema as RegistrationSchema).require_waiver);
};

const asTrimmedString = (value: JsonValue | undefined) =>
  typeof value === "string" ? value.trim() : typeof value === "number" ? String(value).trim() : "";

const sanitizeAnswers = (value: unknown): Record<string, JsonValue> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, JsonValue>;
};

const sanitizeAttachments = (value: unknown) =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];

const getCurrentUserId = async (req: NextRequest) => {
  const token = getBearerToken(req);
  if (!token) return null;

  const userClient = getSupabaseWithToken(token);
  if (!userClient) return null;

  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user?.id) return null;

  return data.user.id;
};

const validateSubmissionPayload = ({
  eventConfig,
  name,
  email,
  phone,
  answers,
  waiverAccepted,
}: {
  eventConfig: Pick<Event, "registration_schema" | "waiver_url" | "signup_mode">;
  name: string;
  email: string;
  phone: string;
  answers: Record<string, JsonValue>;
  waiverAccepted: boolean;
}) => {
  if (!name) return "Full Name is required.";
  if (!email) return "Email is required.";
  if (!phone) return "Phone Number is required.";

  const fields = parseSchemaFields(eventConfig.registration_schema ?? null);
  for (const field of fields) {
    if (!field.required) continue;

    const value = answers[field.name];
    if (field.type === "file") {
      const hasExistingFile =
        (typeof value === "string" && value.trim().length > 0) ||
        (Array.isArray(value) && value.some((entry) => typeof entry === "string" && entry.trim().length > 0));
      if (!hasExistingFile) return `${field.label} is required.`;
      continue;
    }

    if (field.type === "checkbox") {
      if (!Boolean(value)) return `${field.label} is required.`;
      continue;
    }

    if (!asTrimmedString(value)) return `${field.label} is required.`;
  }

  if (eventConfig.signup_mode !== "waitlist" && (eventConfig.waiver_url || schemaRequiresWaiver(eventConfig.registration_schema)) && !waiverAccepted) {
    return "You must accept the waiver to continue.";
  }

  return null;
};

export async function POST(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const serviceClient = getSupabaseServiceRole();
    if (!serviceClient) {
      return NextResponse.json({ error: "Server Supabase service role is not configured." }, { status: 500 });
    }

    const body = (await req.json()) as EventRegistrationRequestBody;
    const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
    if (!eventId) {
      return NextResponse.json({ error: "Event ID is required." }, { status: 400 });
    }

    const { data: eventRow, error: eventError } = await serviceClient
      .from("events")
      .select("id,title,host_type,approval_status,signup_mode,registration_enabled,registration_schema,waiver_url,allow_multiple_registrations,registration_limit,payment_required,payment_amount_cents")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError || !eventRow) {
      return NextResponse.json({ error: "Registration is not available for this event." }, { status: 404 });
    }

    const eventConfig = eventRow as Event;
    if (!isPublicEventVisible(eventConfig)) {
      return NextResponse.json({ error: "Registration is not available for this event yet." }, { status: 404 });
    }
    if (!eventConfig.registration_enabled) {
      return NextResponse.json({ error: "Registration is not enabled for this event." }, { status: 400 });
    }
    if (isPaidEventRegistration(eventConfig)) {
      return NextResponse.json({ error: "Paid events must use checkout." }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const answers = sanitizeAnswers(body.answers);
    const attachments = sanitizeAttachments(body.attachments);
    const waiverAccepted = Boolean(body.waiverAccepted);

    const validationError = validateSubmissionPayload({
      eventConfig,
      name,
      email,
      phone,
      answers,
      waiverAccepted,
    });

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    if (!eventConfig.allow_multiple_registrations) {
      const { data: existingSubmission, error: existingSubmissionError } = await serviceClient
        .from("event_submissions")
        .select("id")
        .eq("event_id", eventConfig.id)
        .eq("user_id", userId)
        .limit(1);

      if (existingSubmissionError) {
        return NextResponse.json({ error: existingSubmissionError.message ?? "Could not verify registration status." }, { status: 500 });
      }

      if ((existingSubmission ?? []).length > 0) {
        return NextResponse.json({ error: getSignupDuplicateMessage(eventConfig) }, { status: 400 });
      }
    }

    if (eventConfig.signup_mode !== "waitlist" && eventConfig.registration_limit && eventConfig.registration_limit > 0) {
      const { count, error: countError } = await serviceClient
        .from("event_submissions")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventConfig.id);

      if (countError) {
        return NextResponse.json({ error: countError.message ?? "Could not verify registration capacity." }, { status: 500 });
      }

      if ((count ?? 0) >= eventConfig.registration_limit) {
        return NextResponse.json({ error: "Registration is full for this event." }, { status: 409 });
      }
    }

    const submissionPayload: EventSubmissionInsert = {
      event_id: eventConfig.id,
      user_id: userId,
      name,
      email,
      phone,
      answers,
      attachments,
      waiver_accepted: waiverAccepted,
      waiver_accepted_at: waiverAccepted ? new Date().toISOString() : null,
    };

    const { data: createdSubmission, error: insertError } = await serviceClient
      .from("event_submissions")
      .insert(submissionPayload)
      .select("*")
      .single();

    if (insertError || !createdSubmission) {
      return NextResponse.json({ error: insertError?.message ?? "Could not submit registration." }, { status: 409 });
    }

    const submission = createdSubmission as EventSubmission;

    try {
      await sendEventSignupNotification({ event: eventConfig, submission });
    } catch (error) {
      console.error("[events/register] ntfy notification failed", error);
    }

    try {
      await sendEventSignupConfirmationEmail({ event: eventConfig, submission });
    } catch (error) {
      console.error("[events/register] confirmation email failed", error);
    }

    return NextResponse.json({ ok: true, submissionId: submission.id });
  } catch {
    return NextResponse.json({ error: "Could not submit registration." }, { status: 500 });
  }
}
