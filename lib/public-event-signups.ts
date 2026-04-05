import type { SupabaseClient } from "@supabase/supabase-js";

import { filterVisiblePublicEvents } from "@/lib/event-approval";
import {
  collapsePartnerSubmissions,
  getBestSuccessfulDraftBySubmissionId,
  type PartnerEventCheckoutDraftRow,
  type PartnerEventSubmissionRow,
} from "@/lib/partner-event-stats";
import type { Database, Event } from "@/lib/supabase/types";

export type PublicEventSignupStats = {
  signup_count: number;
};

export const PUBLIC_EVENT_SELECT =
  "id,title,start_date,end_date,time_info,location,description,host_type,approval_status,image_url,signup_mode,registration_program_slug,sport_id,registration_enabled,registration_limit,payment_required,payment_amount_cents,registration_schema";

export const formatEventSignupLabel = (signupCount?: number | null, registrationLimit?: number | null) => {
  const count = signupCount ?? 0;
  if (registrationLimit && registrationLimit > 0) {
    return `${count}/${registrationLimit} signed up`;
  }

  return `${count} signed up`;
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
    return events.map((event) => ({ ...event, signup_count: 0 }));
  }

  const { data: submissionRows, error: submissionsError } = await client
    .from("event_submissions")
    .select("id,event_id,user_id,created_at")
    .in("event_id", eventIds);

  if (submissionsError || !submissionRows || submissionRows.length === 0) {
    return events.map((event) => ({ ...event, signup_count: 0 }));
  }

  const submissions = submissionRows as PartnerEventSubmissionRow[];
  const submissionIds = submissions.map((submission) => submission.id).filter(Boolean);

  if (submissionIds.length === 0) {
    return events.map((event) => ({ ...event, signup_count: 0 }));
  }

  const { data: draftRows } = await client
    .from("event_checkout_drafts")
    .select("submission_id,amount_cents,status,updated_at,created_at")
    .in("submission_id", submissionIds);

  const bestSuccessfulDraftBySubmissionId = getBestSuccessfulDraftBySubmissionId(
    (draftRows ?? []) as PartnerEventCheckoutDraftRow[],
  );
  const canonicalSubmissions = collapsePartnerSubmissions(submissions, bestSuccessfulDraftBySubmissionId);
  const signupCountByEventId = new Map<string, number>();

  for (const submission of canonicalSubmissions) {
    if (!submission.event_id) continue;
    signupCountByEventId.set(submission.event_id, (signupCountByEventId.get(submission.event_id) ?? 0) + 1);
  }

  return events.map((event) => ({
    ...event,
    signup_count: signupCountByEventId.get(event.id) ?? 0,
  }));
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
