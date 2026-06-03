import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedProfile, getSupabaseServiceRole } from "@/lib/admin-route-auth";
import {
  attachPartnerEventStats,
  type PartnerEventStatsSupabase,
} from "@/lib/partner-event-stats";
import { getPartnerAvailablePayoutAmountCents } from "@/lib/partner-payouts";
import type { Event, PartnerPayoutRequest, PartnerPayoutRequestInsert } from "@/lib/supabase/types";

export async function GET(req: NextRequest) {
  const profile = await getAuthenticatedProfile(req);
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (profile.role !== "partner" && profile.role !== "admin" && profile.role !== "owner") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const supabase = getSupabaseServiceRole();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("partner_payout_requests")
    .select("*")
    .eq("partner_user_id", profile.id)
    .order("requested_at", { ascending: false, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message ?? "Could not load payout requests." }, { status: 500 });
  }

  return NextResponse.json({ payoutRequests: (data ?? []) as PartnerPayoutRequest[] });
}

export async function POST(req: NextRequest) {
  const profile = await getAuthenticatedProfile(req);
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (profile.role !== "partner" && profile.role !== "admin" && profile.role !== "owner") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const supabase = getSupabaseServiceRole();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
  }

  const [{ data: eventRows, error: eventsError }, { data: requestRows, error: requestsError }] = await Promise.all([
    supabase.from("events").select("*").eq("created_by_user_id", profile.id).eq("host_type", "partner"),
    supabase.from("partner_payout_requests").select("*").eq("partner_user_id", profile.id),
  ]);

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message ?? "Could not load partner events." }, { status: 500 });
  }
  if (requestsError) {
    return NextResponse.json({ error: requestsError.message ?? "Could not load payout requests." }, { status: 500 });
  }

  const eventsWithStats = await attachPartnerEventStats(
    supabase as unknown as PartnerEventStatsSupabase,
    ((eventRows ?? []) as Event[]),
  );
  const payoutRequests = (requestRows ?? []) as PartnerPayoutRequest[];
  const availableAmountCents = getPartnerAvailablePayoutAmountCents(eventsWithStats, payoutRequests);

  if (availableAmountCents <= 0) {
    return NextResponse.json({ error: "There is no available payout balance right now." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const insert: PartnerPayoutRequestInsert = {
    partner_user_id: profile.id,
    amount_cents: availableAmountCents,
    status: "requested",
    requested_at: now,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase.from("partner_payout_requests").insert(insert).select("*").single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not create payout request." }, { status: 500 });
  }

  return NextResponse.json({ payoutRequest: data as PartnerPayoutRequest });
}
