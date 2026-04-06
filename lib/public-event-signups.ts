import type { SupabaseClient } from "@supabase/supabase-js";

import { filterVisiblePublicEvents } from "@/lib/event-approval";
import {
  collapsePartnerSubmissions,
  getBestSuccessfulDraftBySubmissionId,
  type PartnerEventCheckoutDraftRow,
  type PartnerEventSubmissionRow,
} from "@/lib/partner-event-stats";
import { isRegularAslSundayLeagueEvent } from "@/lib/sunday-league";
import type { Database, Event } from "@/lib/supabase/types";

export type PublicEventSignupStats = {
  signup_count: number;
  signup_unit?: "teams" | null;
};

export type PublicEventSignupCountResponse = {
  counts: Array<{
    eventId: string;
    signupCount: number;
    signupUnit?: "teams" | null;
  }>;
};

export const PUBLIC_EVENT_SELECT =
  "id,title,start_date,end_date,time_info,location,description,host_type,approval_status,image_url,signup_mode,registration_program_slug,sport_id,registration_enabled,registration_limit,payment_required,payment_amount_cents,registration_schema";

export const formatEventSignupLabel = (
  signupCount?: number | null,
  registrationLimit?: number | null,
  signupUnit?: "teams" | null,
) => {
  const count = signupCount ?? 0;
  const usesTeams = signupUnit === "teams";

  if (registrationLimit && registrationLimit > 0) {
    return usesTeams ? `${count}/${registrationLimit} teams signed up` : `${count}/${registrationLimit} signed up`;
  }

  if (usesTeams) {
    return `${count} team${count === 1 ? "" : "s"} signed up`;
  }

  return `${count} signed up`;
};

const mergePublicEventSignupCounts = <T extends Pick<Event, "id">>(
  events: T[],
  signupStatsByEventId: Map<string, PublicEventSignupStats>,
): Array<T & PublicEventSignupStats> =>
  events.map((event) => ({
    ...event,
    signup_count: signupStatsByEventId.get(event.id)?.signup_count ?? 0,
    signup_unit: signupStatsByEventId.get(event.id)?.signup_unit ?? null,
  }));

const loadPublicEventSignupCountsFromApi = async (eventIds: string[]) => {
  try {
    const response = await fetch("/api/public/event-signups", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ eventIds }),
    });

    if (!response.ok) {
      return null;
    }

    const json = (await response.json().catch(() => null)) as PublicEventSignupCountResponse | null;
    if (!json?.counts || !Array.isArray(json.counts)) {
      return null;
    }

    return new Map(
      json.counts.map((entry) => [
        entry.eventId,
        {
          signup_count: entry.signupCount ?? 0,
          signup_unit: entry.signupUnit ?? null,
        } satisfies PublicEventSignupStats,
      ]),
    );
  } catch {
    return null;
  }
};

const loadPublicEventSignupCountsDirect = async <T extends Pick<Event, "id">>(
  client: SupabaseClient<Database>,
  events: T[],
): Promise<Map<string, PublicEventSignupStats>> => {
  if (events.length === 0) {
    return new Map();
  }

  const eventIds = Array.from(new Set(events.map((event) => event.id).filter(Boolean)));
  if (eventIds.length === 0) {
    return new Map();
  }

  const sundayLeagueEventIds = new Set(
    events
      .filter((event) => {
        const eventDetails = event as Partial<Pick<Event, "title" | "description" | "registration_program_slug" | "sport_slug">>;

        return isRegularAslSundayLeagueEvent({
          title: typeof eventDetails.title === "string" ? eventDetails.title : "",
          description: typeof eventDetails.description === "string" ? eventDetails.description : "",
          registration_program_slug:
            typeof eventDetails.registration_program_slug === "string" ? eventDetails.registration_program_slug : "",
          sport_slug: typeof eventDetails.sport_slug === "string" ? eventDetails.sport_slug : "",
        });
      })
      .map((event) => event.id)
      .filter(Boolean),
  );
  const standardEventIds = eventIds.filter((eventId) => !sundayLeagueEventIds.has(eventId));
  const signupCountByEventId = new Map<string, number>();

  if (sundayLeagueEventIds.size > 0) {
    const { count: sundayLeagueTeamCount, error: sundayLeagueError } = await client
      .from("sunday_league_teams")
      .select("id", { count: "exact", head: true });

    if (!sundayLeagueError) {
      for (const eventId of sundayLeagueEventIds) {
        signupCountByEventId.set(eventId, sundayLeagueTeamCount ?? 0);
      }
    }
  }

  if (standardEventIds.length > 0) {
    const { data: submissionRows, error: submissionsError } = await client
      .from("event_submissions")
      .select("id,event_id,user_id,created_at")
      .in("event_id", standardEventIds);

    if (!submissionsError && submissionRows && submissionRows.length > 0) {
      const submissions = submissionRows as PartnerEventSubmissionRow[];
      const submissionIds = submissions.map((submission) => submission.id).filter(Boolean);

      if (submissionIds.length > 0) {
        const { data: draftRows } = await client
          .from("event_checkout_drafts")
          .select("submission_id,amount_cents,status,updated_at,created_at")
          .in("submission_id", submissionIds);

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
  }

  return new Map(
    eventIds.map((eventId) => [
      eventId,
      {
        signup_count: signupCountByEventId.get(eventId) ?? 0,
        signup_unit: sundayLeagueEventIds.has(eventId) ? "teams" : null,
      } satisfies PublicEventSignupStats,
    ]),
  );
};

export const attachPublicEventSignupCounts = async <T extends Pick<Event, "id">>(
  client: SupabaseClient<Database>,
  events: T[],
): Promise<Array<T & PublicEventSignupStats>> => {
  if (events.length === 0) {
    return [];
  }

  const eventIds = Array.from(new Set(events.map((event) => event.id).filter(Boolean)));
  if (eventIds.length === 0) {
    return events.map((event) => ({ ...event, signup_count: 0, signup_unit: null }));
  }

  if (typeof window !== "undefined") {
    const apiSignupCounts = await loadPublicEventSignupCountsFromApi(eventIds);
    if (apiSignupCounts) {
      return mergePublicEventSignupCounts(events, apiSignupCounts);
    }
  }

  const directSignupCounts = await loadPublicEventSignupCountsDirect(client, events);
  return mergePublicEventSignupCounts(events, directSignupCounts);
};

export const loadVisiblePublicEvents = async <T extends Event = Event>(
  client: SupabaseClient<Database>,
  options?: { limit?: number },
): Promise<Array<T & PublicEventSignupStats>> => {
  let query = client.from("events").select(PUBLIC_EVENT_SELECT).order("start_date", { ascending: true, nullsFirst: false });

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error || !data) {
    return [];
  }

  const visibleEvents = filterVisiblePublicEvents(data as T[]);
  return attachPublicEventSignupCounts(client, visibleEvents);
};
