import { NextRequest, NextResponse } from "next/server";

import { getBearerToken, getSupabaseServiceRole, getSupabaseWithToken } from "@/lib/admin-route-auth";
import { isPublicEventVisible } from "@/lib/event-approval";
import { EVENT_CHECKOUT_WINDOW_MS, EVENT_PAYMENT_CURRENCY } from "@/lib/event-payments";
import { createSquarePaymentLink, getAppUrl, getSquareLocationId } from "@/lib/square";
import type {
  Event,
  EventCheckoutDraft,
  EventSubmissionInsert,
  JsonValue,
} from "@/lib/supabase/types";

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

type EventCheckoutRequestBody = Partial<{
  eventId: string;
  name: string;
  email: string;
  phone: string;
  answers: unknown;
  attachments: unknown;
  waiverAccepted: boolean;
}>;

const STALE_DRAFT_AGE_MS = EVENT_CHECKOUT_WINDOW_MS;

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

const markStaleDraftsExpired = async () => {
  const serviceClient = getSupabaseServiceRole();
  if (!serviceClient) return;

  const staleBefore = new Date(Date.now() - STALE_DRAFT_AGE_MS).toISOString();
  await serviceClient
    .from("event_checkout_drafts")
    .update({
      status: "expired",
      error_message: "Checkout window expired before payment was completed.",
    })
    .eq("status", "pending")
    .lt("created_at", staleBefore);
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

  if ((eventConfig.waiver_url || schemaRequiresWaiver(eventConfig.registration_schema)) && !waiverAccepted) {
    return "You must accept the waiver to continue.";
  }

  return null;
};

export async function GET(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const draftId = req.nextUrl.searchParams.get("draftId")?.trim() || "";
    if (!draftId) {
      return NextResponse.json({ error: "Draft ID is required." }, { status: 400 });
    }

    const serviceClient = getSupabaseServiceRole();
    if (!serviceClient) {
      return NextResponse.json({ error: "Server Supabase service role is not configured." }, { status: 500 });
    }

    const { data, error } = await serviceClient
      .from("event_checkout_drafts")
      .select("id,event_id,status,submission_id,error_message,square_checkout_url,created_at")
      .eq("id", draftId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Checkout draft not found." }, { status: 404 });
    }

    const draft = data as Pick<
      EventCheckoutDraft,
      "id" | "event_id" | "status" | "submission_id" | "error_message" | "square_checkout_url"
    >;

    return NextResponse.json({
      ok: true,
      draftId: draft.id,
      eventId: draft.event_id,
      status: draft.status ?? "pending",
      submissionId: draft.submission_id ?? null,
      error: draft.error_message ?? null,
      checkoutUrl: draft.square_checkout_url ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Could not load checkout status." }, { status: 500 });
  }
}

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

    const appUrl = getAppUrl();
    const squareLocationId = getSquareLocationId();
    if (!appUrl) {
      return NextResponse.json({ error: "APP_URL is not configured." }, { status: 500 });
    }
    if (!squareLocationId) {
      return NextResponse.json({ error: "SQUARE_LOCATION_ID is not configured." }, { status: 500 });
    }

    await markStaleDraftsExpired();

    const body = (await req.json()) as EventCheckoutRequestBody;
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
    if (eventConfig.signup_mode === "waitlist") {
      return NextResponse.json({ error: "Waitlist events do not use payment checkout." }, { status: 400 });
    }
    if (!eventConfig.payment_required || !eventConfig.payment_amount_cents || eventConfig.payment_amount_cents <= 0) {
      return NextResponse.json({ error: "Payment is not required for this event." }, { status: 400 });
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

    const { data: existingDraft } = await serviceClient
      .from("event_checkout_drafts")
      .select("id,status,amount_cents,square_checkout_url")
      .eq("user_id", userId)
      .eq("event_id", eventConfig.id)
      .in("status", ["pending", "paid"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingDraft?.square_checkout_url && existingDraft.amount_cents === eventConfig.payment_amount_cents) {
      return NextResponse.json({
        ok: true,
        draftId: existingDraft.id,
        checkoutUrl: existingDraft.square_checkout_url,
      });
    }

    if (existingDraft?.id) {
      await serviceClient
        .from("event_checkout_drafts")
        .update({
          status: "expired",
          error_message: "A new checkout attempt was started.",
        })
        .eq("id", existingDraft.id);
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
        return NextResponse.json({ error: "You are already registered for this event." }, { status: 400 });
      }
    }

    if (eventConfig.registration_limit && eventConfig.registration_limit > 0) {
      const [{ count, error: countError }, { count: draftCount, error: draftCountError }] = await Promise.all([
        serviceClient
          .from("event_submissions")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventConfig.id),
        serviceClient
          .from("event_checkout_drafts")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventConfig.id)
          .in("status", ["pending", "paid"]),
      ]);

      if (countError || draftCountError) {
        return NextResponse.json({ error: countError?.message || draftCountError?.message || "Could not verify registration capacity." }, { status: 500 });
      }

      if ((count ?? 0) + (draftCount ?? 0) >= eventConfig.registration_limit) {
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

    const { data: insertedDraft, error: insertError } = await serviceClient
      .from("event_checkout_drafts")
      .insert({
        user_id: userId,
        event_id: eventConfig.id,
        status: "pending",
        amount_cents: eventConfig.payment_amount_cents,
        currency: EVENT_PAYMENT_CURRENCY,
        submission_payload: submissionPayload,
      })
      .select("*")
      .single();

    if (insertError || !insertedDraft) {
      return NextResponse.json({ error: insertError?.message ?? "Could not start the event checkout." }, { status: 409 });
    }

    const draft = insertedDraft as EventCheckoutDraft;

    try {
      const redirectUrl = new URL("/events/checkout", appUrl);
      redirectUrl.searchParams.set("draftId", draft.id);

      const squareResponse = await createSquarePaymentLink({
        idempotency_key: draft.id,
        quick_pay: {
          name: `${eventConfig.title} Registration`,
          price_money: {
            amount: eventConfig.payment_amount_cents,
            currency: EVENT_PAYMENT_CURRENCY,
          },
          location_id: squareLocationId,
        },
        checkout_options: {
          redirect_url: redirectUrl.toString(),
        },
      });

      const paymentLinkId = squareResponse?.payment_link?.id?.trim() || null;
      const checkoutUrl = squareResponse?.payment_link?.url?.trim() || null;
      const squareOrderId =
        squareResponse?.payment_link?.order_id?.trim() ||
        squareResponse?.related_resources?.orders?.[0]?.id?.trim() ||
        null;

      if (!checkoutUrl) {
        throw new Error("Square did not return a checkout URL.");
      }

      await serviceClient
        .from("event_checkout_drafts")
        .update({
          square_payment_link_id: paymentLinkId,
          square_checkout_url: checkoutUrl,
          square_order_id: squareOrderId,
        })
        .eq("id", draft.id);

      return NextResponse.json({
        ok: true,
        draftId: draft.id,
        checkoutUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create the Square checkout link.";
      await serviceClient
        .from("event_checkout_drafts")
        .update({
          status: "failed",
          error_message: message,
        })
        .eq("id", draft.id);

      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: "Could not start the event checkout." }, { status: 500 });
  }
}
