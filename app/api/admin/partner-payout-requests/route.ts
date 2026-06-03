import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedProfile, getSupabaseServiceRole } from "@/lib/admin-route-auth";
import { canAccessAdminDashboard } from "@/lib/event-approval";
import type { PartnerPayoutRequest, PartnerPayoutRequestStatus, PartnerPayoutRequestUpdate, Profile } from "@/lib/supabase/types";

const PAYOUT_STATUSES = ["requested", "approved", "paid", "rejected"] as const satisfies PartnerPayoutRequestStatus[];

const isPayoutStatus = (value: unknown): value is PartnerPayoutRequestStatus =>
  typeof value === "string" && PAYOUT_STATUSES.includes(value as PartnerPayoutRequestStatus);

const trimOptionalString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

export async function GET(req: NextRequest) {
  const profile = await getAuthenticatedProfile(req);
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!canAccessAdminDashboard(profile.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const supabase = getSupabaseServiceRole();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
  }

  const { data: requests, error } = await supabase
    .from("partner_payout_requests")
    .select("*")
    .order("requested_at", { ascending: false, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message ?? "Could not load payout requests." }, { status: 500 });
  }

  const partnerIds = Array.from(new Set(((requests ?? []) as PartnerPayoutRequest[]).map((request) => request.partner_user_id)));
  let profilesById: Record<string, Pick<Profile, "id" | "name">> = {};

  if (partnerIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id,name").in("id", partnerIds);
    if (profilesError) {
      return NextResponse.json({ error: profilesError.message ?? "Could not load partner profiles." }, { status: 500 });
    }
    profilesById = ((profiles ?? []) as Pick<Profile, "id" | "name">[]).reduce<Record<string, Pick<Profile, "id" | "name">>>(
      (acc, partnerProfile) => {
        acc[partnerProfile.id] = partnerProfile;
        return acc;
      },
      {},
    );
  }

  return NextResponse.json({
    payoutRequests: ((requests ?? []) as PartnerPayoutRequest[]).map((request) => ({
      ...request,
      partner_name: profilesById[request.partner_user_id]?.name ?? "Partner",
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const profile = await getAuthenticatedProfile(req);
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!canAccessAdminDashboard(profile.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const supabase = getSupabaseServiceRole();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        id?: unknown;
        status?: unknown;
        square_reference_id?: unknown;
        admin_notes?: unknown;
      }
    | null;

  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const status = body?.status;
  if (!id) {
    return NextResponse.json({ error: "Missing payout request ID." }, { status: 400 });
  }
  if (!isPayoutStatus(status)) {
    return NextResponse.json({ error: "Invalid payout status." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const update: PartnerPayoutRequestUpdate = {
    status,
    admin_notes: trimOptionalString(body?.admin_notes),
    square_reference_id: trimOptionalString(body?.square_reference_id),
    updated_at: now,
  };

  if (status === "approved") {
    update.approved_by_user_id = profile.id;
    update.approved_at = now;
    update.rejected_at = null;
  }
  if (status === "paid") {
    update.approved_by_user_id = profile.id;
    update.approved_at = now;
    update.paid_at = now;
    update.rejected_at = null;
  }
  if (status === "rejected") {
    update.rejected_at = now;
  }

  const { data, error } = await supabase
    .from("partner_payout_requests")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not update payout request." }, { status: 500 });
  }

  return NextResponse.json({ payoutRequest: data as PartnerPayoutRequest });
}
