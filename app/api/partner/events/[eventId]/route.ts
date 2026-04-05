import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedProfile, getSupabaseServiceRole } from "@/lib/admin-route-auth";
import { sanitizeRegistrationSchema } from "@/lib/event-registration-schema";
import { parseOptionalInteger, parseOptionalMoneyCents, trimOptionalString } from "@/lib/event-approval";
import type { Event, EventUpdate } from "@/lib/supabase/types";

type EventWriteBody = {
  title?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  time_info?: unknown;
  location?: unknown;
  description?: unknown;
  image_url?: unknown;
  signup_mode?: unknown;
  registration_program_slug?: unknown;
  sport_id?: unknown;
  flyer_image_url?: unknown;
  flyer_details?: unknown;
  registration_enabled?: unknown;
  waiver_url?: unknown;
  registration_limit?: unknown;
  payment_required?: unknown;
  payment_amount?: unknown;
  registration_schema?: unknown;
};

const getFlyerName = (event: Pick<Event, "title" | "registration_program_slug">) =>
  event.registration_program_slug?.trim() || event.title.trim();

const syncFlyerRecord = async (
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceRole>>,
  event: Pick<Event, "id" | "title" | "registration_program_slug">,
  flyerImageUrl: string | null,
  flyerDetails: string | null
) => {
  const { data: currentFlyer } = await supabase
    .from("flyers")
    .select("id,flyer_image_url,details")
    .eq("event_id", event.id)
    .maybeSingle();

  if (!currentFlyer && !flyerImageUrl && !flyerDetails) {
    return null;
  }

  const payload = {
    event_id: event.id,
    flyer_name: getFlyerName(event),
    flyer_image_url: flyerImageUrl,
    details: flyerDetails,
  };

  const query = currentFlyer
    ? supabase.from("flyers").update(payload).eq("id", currentFlyer.id)
    : supabase.from("flyers").insert(payload);

  const { error } = await query;
  if (error) {
    throw error;
  }

  return flyerImageUrl;
};

const buildPartnerEventPayload = (body: EventWriteBody) => {
  const title = trimOptionalString(body.title);
  if (!title) {
    return { error: "Title is required." };
  }

  const signupMode = "registration" as const;
  const registrationEnabled = true;
  const paymentRequired = Boolean(body.payment_required);
  const paymentAmountCents = paymentRequired ? parseOptionalMoneyCents(body.payment_amount) : null;
  const registrationSchema = sanitizeRegistrationSchema(body.registration_schema);

  if (paymentRequired && (!paymentAmountCents || paymentAmountCents <= 0)) {
    return { error: "Enter a payment amount greater than $0.00 when payment is required." };
  }

  const registrationLimit = parseOptionalInteger(body.registration_limit);
  if (registrationLimit !== null && registrationLimit <= 0) {
    return { error: "Registration limit must be greater than 0." };
  }

  const payload: EventUpdate = {
    title,
    start_date: trimOptionalString(body.start_date),
    end_date: trimOptionalString(body.end_date),
    time_info: trimOptionalString(body.time_info),
    location: trimOptionalString(body.location),
    description: trimOptionalString(body.description),
    host_type: "partner",
    image_url: trimOptionalString(body.image_url),
    signup_mode: signupMode,
    registration_program_slug: trimOptionalString(body.registration_program_slug),
    sport_id: trimOptionalString(body.sport_id),
    registration_enabled: registrationEnabled,
    registration_schema: registrationSchema,
    waiver_url: trimOptionalString(body.waiver_url),
    allow_multiple_registrations: false,
    registration_limit: registrationLimit,
    payment_required: paymentRequired,
    payment_amount_cents: paymentRequired ? paymentAmountCents : null,
    approval_status: "pending_approval",
    submitted_for_approval_at: new Date().toISOString(),
    approved_at: null,
    approved_by_user_id: null,
  };

  return { payload };
};

const selectClause =
  "id,title,start_date,end_date,time_info,location,description,host_type,image_url,signup_mode,registration_program_slug,sport_id,registration_enabled,registration_schema,waiver_url,registration_limit,payment_required,payment_amount_cents,created_by_user_id,approval_status,approval_notes,submitted_for_approval_at,approved_at";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  try {
    const profile = await getAuthenticatedProfile(req);
    if (!profile) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (profile.role !== "partner" && profile.role !== "admin" && profile.role !== "owner") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { eventId } = await context.params;
    const normalizedEventId = eventId?.trim();
    if (!normalizedEventId) {
      return NextResponse.json({ error: "Event ID is required." }, { status: 400 });
    }

    const supabase = getSupabaseServiceRole();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
    }

    const { data: existingEvent, error: existingError } = await supabase
      .from("events")
      .select("id,created_by_user_id")
      .eq("id", normalizedEventId)
      .maybeSingle();

    if (existingError || !existingEvent) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    if (existingEvent.created_by_user_id !== profile.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await req.json()) as EventWriteBody;
    const result = buildPartnerEventPayload(body);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    const flyerImageUrl = trimOptionalString(body.flyer_image_url);
    const flyerDetails = trimOptionalString(body.flyer_details);

    const { data, error } = await supabase
      .from("events")
      .update(result.payload)
      .eq("id", normalizedEventId)
      .eq("created_by_user_id", profile.id)
      .select(selectClause)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Could not update the event." }, { status: 500 });
    }

    await syncFlyerRecord(supabase, data as Event, flyerImageUrl, flyerDetails);

    return NextResponse.json({
      ok: true,
      event: {
        ...data,
        flyer_image_url: flyerImageUrl,
        flyer_details: flyerDetails,
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not update the event." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  try {
    const profile = await getAuthenticatedProfile(req);
    if (!profile) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (profile.role !== "partner" && profile.role !== "admin" && profile.role !== "owner") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { eventId } = await context.params;
    const normalizedEventId = eventId?.trim();
    if (!normalizedEventId) {
      return NextResponse.json({ error: "Event ID is required." }, { status: 400 });
    }

    const supabase = getSupabaseServiceRole();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
    }

    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", normalizedEventId)
      .eq("created_by_user_id", profile.id);

    if (error) {
      return NextResponse.json({ error: error.message ?? "Could not delete the event." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not delete the event." }, { status: 500 });
  }
}
