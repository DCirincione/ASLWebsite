import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedProfile, getSupabaseServiceRole } from "@/lib/admin-route-auth";
import { collapsePartnerSubmissions, getBestSuccessfulDraftBySubmissionId } from "@/lib/partner-event-stats";
import type { EventCheckoutDraft, EventSubmission, Profile } from "@/lib/supabase/types";

type PartnerSignupRecord = {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_phone?: string | null;
  submitted_at?: string | null;
  paid_amount_cents?: number | null;
};

type EventSubmissionRow = Pick<EventSubmission, "id" | "event_id" | "user_id" | "name" | "email" | "phone" | "created_at">;
type EventCheckoutDraftRow = Pick<
  EventCheckoutDraft,
  "submission_id" | "amount_cents" | "status" | "updated_at" | "created_at"
>;
type ProfileRow = Pick<Profile, "id" | "name">;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ eventId: string }> },
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

    const { data: eventRow, error: eventError } = await supabase
      .from("events")
      .select("id,title,created_by_user_id")
      .eq("id", normalizedEventId)
      .maybeSingle();

    if (eventError || !eventRow) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    if (eventRow.created_by_user_id !== profile.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { data: submissionRows, error: submissionsError } = await supabase
      .from("event_submissions")
      .select("id,event_id,user_id,name,email,phone,created_at")
      .eq("event_id", normalizedEventId)
      .order("created_at", { ascending: false });

    if (submissionsError) {
      return NextResponse.json({ error: submissionsError.message ?? "Could not load event signups." }, { status: 500 });
    }

    const submissions = (submissionRows ?? []) as EventSubmissionRow[];
    if (submissions.length === 0) {
      return NextResponse.json({
        eventId: normalizedEventId,
        eventTitle: eventRow.title ?? "Unknown event",
        signups: [] as PartnerSignupRecord[],
      });
    }

    const submissionIds = submissions.map((row) => row.id).filter(Boolean);
    const userIds = Array.from(new Set(submissions.map((row) => row.user_id).filter(Boolean)));

    const [{ data: draftRows, error: draftsError }, { data: profileRows, error: profilesError }] = await Promise.all([
      supabase
        .from("event_checkout_drafts")
        .select("submission_id,amount_cents,status,updated_at,created_at")
        .in("submission_id", submissionIds),
      userIds.length > 0
        ? supabase.from("profiles").select("id,name").in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (draftsError || profilesError) {
      return NextResponse.json(
        { error: draftsError?.message ?? profilesError?.message ?? "Could not load event signups." },
        { status: 500 },
      );
    }

    const profileById = new Map(
      ((profileRows ?? []) as ProfileRow[]).map((row) => [row.id, row.name?.trim() || "Unknown user"]),
    );
    const bestSuccessfulDraftBySubmissionId = getBestSuccessfulDraftBySubmissionId(
      (draftRows ?? []) as EventCheckoutDraftRow[],
    );
    const canonicalSubmissions = collapsePartnerSubmissions(submissions, bestSuccessfulDraftBySubmissionId);

    const signups: PartnerSignupRecord[] = canonicalSubmissions.map((submission) => {
      const payment = bestSuccessfulDraftBySubmissionId.get(submission.id);
      return {
        id: submission.id,
        user_id: submission.user_id,
        user_name: profileById.get(submission.user_id) ?? submission.name ?? "Unknown user",
        user_email: submission.email,
        user_phone: submission.phone ?? null,
        submitted_at: submission.created_at ?? null,
        paid_amount_cents: payment?.amount_cents ?? null,
      };
    });

    return NextResponse.json({
      eventId: normalizedEventId,
      eventTitle: eventRow.title ?? "Unknown event",
      signups,
    });
  } catch {
    return NextResponse.json({ error: "Could not load event signups." }, { status: 500 });
  }
}
