import { NextRequest, NextResponse } from "next/server";

import {
  getAuthenticatedProfile,
  getSupabaseServiceRole,
  getSupabaseWithToken,
} from "@/lib/admin-route-auth";
import { formatEventPaymentAmount } from "@/lib/event-payments";
import {
  attachPartnerEventStats,
  type PartnerEventStats,
  type PartnerEventStatsSupabase,
} from "@/lib/partner-event-stats";
import type { ContactMessageInsert, Event } from "@/lib/supabase/types";

type PayoutRequestBody = {
  eventId?: unknown;
};

type PartnerPayoutEvent = Pick<Event, "id" | "title"> & PartnerEventStats;

export async function POST(req: NextRequest) {
  try {
    const profile = await getAuthenticatedProfile(req);
    if (!profile) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (profile.role !== "partner" && profile.role !== "admin" && profile.role !== "owner") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await req.json()) as PayoutRequestBody;
    const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
    if (!eventId) {
      return NextResponse.json({ error: "Event ID is required." }, { status: 400 });
    }

    const supabase = getSupabaseServiceRole();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
    }
    const partnerEventStatsSupabase = supabase as unknown as PartnerEventStatsSupabase;

    const { data: eventRow, error: eventError } = await supabase
      .from("events")
      .select("id,title,created_by_user_id")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError || !eventRow) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    if (eventRow.created_by_user_id !== profile.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const [eventWithStats] = (await attachPartnerEventStats(partnerEventStatsSupabase, [
      eventRow as Event,
    ])) as PartnerPayoutEvent[];
    if (!eventWithStats) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    if ((eventWithStats.earned_amount_cents ?? 0) <= 0) {
      return NextResponse.json({ error: "This event does not have any payout balance yet." }, { status: 400 });
    }

    const supabaseWithToken = getSupabaseWithToken(profile.token);
    if (!supabaseWithToken) {
      return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
    }

    const { data: userData, error: userError } = await supabaseWithToken.auth.getUser(profile.token);
    const userEmail = userError ? null : userData.user?.email?.trim() ?? null;
    const requesterEmail = userEmail || `partner-${profile.id}@asl.local`;
    const requestedAt = new Date().toISOString();

    const payload: ContactMessageInsert = {
      name: profile.name?.trim() || "Partner payout request",
      email: requesterEmail,
      message: [
        "Partner payout request",
        `Partner name: ${profile.name?.trim() || "Unknown partner"}`,
        `Partner user ID: ${profile.id}`,
        `Partner email: ${requesterEmail}`,
        `Event title: ${eventWithStats.title}`,
        `Event ID: ${eventWithStats.id}`,
        `Total signups: ${eventWithStats.signup_count}`,
        `Paid signups: ${eventWithStats.paid_signup_count}`,
        `Earned from signups: ${formatEventPaymentAmount(eventWithStats.earned_amount_cents ?? 0)}`,
        `Requested at: ${requestedAt}`,
      ].join("\n"),
      is_read: false,
      read_at: null,
    };

    const { error: insertError } = await supabase.from("contact_messages").insert(payload);
    if (insertError) {
      return NextResponse.json({ error: insertError.message ?? "Could not send the payout request." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      eventId: eventWithStats.id,
      earnedAmountCents: eventWithStats.earned_amount_cents ?? 0,
      signupCount: eventWithStats.signup_count,
      paidSignupCount: eventWithStats.paid_signup_count,
    });
  } catch {
    return NextResponse.json({ error: "Could not send the payout request." }, { status: 500 });
  }
}
