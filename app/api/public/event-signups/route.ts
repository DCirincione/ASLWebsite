import { NextRequest, NextResponse } from "next/server";

import { filterVisiblePublicEvents } from "@/lib/event-approval";
import { getSupabaseServer } from "@/lib/admin-route-auth";
import {
  collapsePartnerSubmissions,
  getBestSuccessfulDraftBySubmissionId,
  type PartnerEventCheckoutDraftRow,
  type PartnerEventSubmissionRow,
} from "@/lib/partner-event-stats";
import type { PublicEventSignupCountResponse } from "@/lib/public-event-signups";
import { isRegularAslSundayLeagueEvent } from "@/lib/sunday-league";
import type { Event } from "@/lib/supabase/types";

type RequestBody = {
  eventIds?: unknown;
};

type PublicEventRow = Pick<
  Event,
  "id" | "title" | "description" | "registration_program_slug" | "host_type" | "approval_status"
>;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as RequestBody | null;
    const eventIds = Array.isArray(body?.eventIds)
      ? Array.from(
          new Set(
            body.eventIds
              .filter((value): value is string => typeof value === "string")
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        ).slice(0, 100)
      : [];

    if (eventIds.length === 0) {
      return NextResponse.json({ counts: [] } satisfies PublicEventSignupCountResponse);
    }

    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
    }

    const { data: eventRows, error: eventError } = await supabase
      .from("events")
      .select("id,title,description,registration_program_slug,host_type,approval_status")
      .in("id", eventIds);

    if (eventError) {
      return NextResponse.json(
        { error: eventError.message ?? "Could not load public event signup counts." },
        { status: 500 },
      );
    }

    const visibleEvents = filterVisiblePublicEvents((eventRows ?? []) as PublicEventRow[]);
    if (visibleEvents.length === 0) {
      return NextResponse.json({ counts: [] } satisfies PublicEventSignupCountResponse);
    }

    const sundayLeagueEventIds = new Set(
      visibleEvents
        .filter((event) =>
          isRegularAslSundayLeagueEvent({
            title: event.title ?? "",
            description: event.description ?? "",
            registration_program_slug: event.registration_program_slug ?? "",
            sport_slug: "",
          }),
        )
        .map((event) => event.id)
        .filter(Boolean),
    );
    const standardEventIds = visibleEvents.map((event) => event.id).filter((eventId) => !sundayLeagueEventIds.has(eventId));
    const signupCountByEventId = new Map<string, number>();

    if (sundayLeagueEventIds.size > 0) {
      const { count: sundayLeagueTeamCount, error: sundayLeagueError } = await supabase
        .from("sunday_league_teams")
        .select("id", { count: "exact", head: true });

      if (sundayLeagueError) {
        return NextResponse.json(
          { error: sundayLeagueError.message ?? "Could not load Sunday League signup counts." },
          { status: 500 },
        );
      }

      for (const eventId of sundayLeagueEventIds) {
        signupCountByEventId.set(eventId, sundayLeagueTeamCount ?? 0);
      }
    }

    if (standardEventIds.length > 0) {
      const { data: submissionRows, error: submissionsError } = await supabase
        .from("event_submissions")
        .select("id,event_id,user_id,created_at")
        .in("event_id", standardEventIds);

      if (submissionsError) {
        return NextResponse.json(
          { error: submissionsError.message ?? "Could not load event signup counts." },
          { status: 500 },
        );
      }

      const submissions = (submissionRows ?? []) as PartnerEventSubmissionRow[];
      const submissionIds = submissions.map((submission) => submission.id).filter(Boolean);

      if (submissionIds.length > 0) {
        const { data: draftRows, error: draftsError } = await supabase
          .from("event_checkout_drafts")
          .select("submission_id,amount_cents,status,updated_at,created_at")
          .in("submission_id", submissionIds);

        if (draftsError) {
          return NextResponse.json(
            { error: draftsError.message ?? "Could not load event signup counts." },
            { status: 500 },
          );
        }

        const bestSuccessfulDraftBySubmissionId = getBestSuccessfulDraftBySubmissionId(
          (draftRows ?? []) as PartnerEventCheckoutDraftRow[],
        );
        const canonicalSubmissions = collapsePartnerSubmissions(submissions, bestSuccessfulDraftBySubmissionId);

        for (const submission of canonicalSubmissions) {
          if (!submission.event_id) continue;
          signupCountByEventId.set(submission.event_id, (signupCountByEventId.get(submission.event_id) ?? 0) + 1);
        }
      }
    }

    return NextResponse.json({
      counts: visibleEvents.map((event) => ({
        eventId: event.id,
        signupCount: signupCountByEventId.get(event.id) ?? 0,
        signupUnit: sundayLeagueEventIds.has(event.id) ? "teams" : null,
      })),
    } satisfies PublicEventSignupCountResponse);
  } catch {
    return NextResponse.json({ error: "Could not load public event signup counts." }, { status: 500 });
  }
}
