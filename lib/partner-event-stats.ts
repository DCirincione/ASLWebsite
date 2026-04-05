import type { Event, EventCheckoutDraft, EventSubmission } from "@/lib/supabase/types";

export type PartnerEventStats = {
  signup_count: number;
  paid_signup_count: number;
  earned_amount_cents: number;
};

export type PartnerEventStatsSupabase = {
  from: (table: "event_submissions" | "event_checkout_drafts") => {
    select: (columns: string) => {
      in: (column: string, values: string[]) => Promise<{ data: unknown[] | null; error: { message?: string | null } | null }>;
    };
  };
};

type EventWithId = Pick<Event, "id">;
type PartnerEventLike = EventWithId & Record<string, unknown>;
export type PartnerEventSubmissionRow = Pick<EventSubmission, "id" | "event_id" | "user_id" | "created_at">;
export type PartnerEventCheckoutDraftRow = Pick<
  EventCheckoutDraft,
  "submission_id" | "amount_cents" | "status" | "updated_at" | "created_at"
>;

const emptyStats = (): PartnerEventStats => ({
  signup_count: 0,
  paid_signup_count: 0,
  earned_amount_cents: 0,
});

const getDraftTimestamp = (draft: Pick<EventCheckoutDraft, "updated_at" | "created_at">) =>
  draft.updated_at ?? draft.created_at ?? "";

const getSubmissionTimestamp = (submission: Pick<EventSubmission, "created_at">) => submission.created_at ?? "";

const getPartnerSubmissionKey = (submission: Pick<EventSubmission, "event_id" | "user_id" | "id">) =>
  submission.user_id ? `${submission.event_id}:${submission.user_id}` : `${submission.event_id}:${submission.id}`;

export const getBestSuccessfulDraftBySubmissionId = (
  draftRows: PartnerEventCheckoutDraftRow[],
) => {
  const bestSuccessfulDraftBySubmissionId = new Map<string, PartnerEventCheckoutDraftRow>();

  for (const row of draftRows) {
    if (!row.submission_id || !row.amount_cents || row.amount_cents <= 0) continue;
    if (row.status !== "paid" && row.status !== "completed") continue;

    const existing = bestSuccessfulDraftBySubmissionId.get(row.submission_id);
    if (!existing || getDraftTimestamp(row) >= getDraftTimestamp(existing)) {
      bestSuccessfulDraftBySubmissionId.set(row.submission_id, row);
    }
  }

  return bestSuccessfulDraftBySubmissionId;
};

export const collapsePartnerSubmissions = <T extends PartnerEventSubmissionRow>(
  submissions: T[],
  bestSuccessfulDraftBySubmissionId: Map<string, PartnerEventCheckoutDraftRow>,
) => {
  const canonicalByKey = new Map<string, T>();

  for (const submission of submissions) {
    const key = getPartnerSubmissionKey(submission);
    const existing = canonicalByKey.get(key);
    if (!existing) {
      canonicalByKey.set(key, submission);
      continue;
    }

    const existingPaid = bestSuccessfulDraftBySubmissionId.has(existing.id);
    const nextPaid = bestSuccessfulDraftBySubmissionId.has(submission.id);

    if (nextPaid && !existingPaid) {
      canonicalByKey.set(key, submission);
      continue;
    }
    if (!nextPaid && existingPaid) {
      continue;
    }

    if (getSubmissionTimestamp(submission) >= getSubmissionTimestamp(existing)) {
      canonicalByKey.set(key, submission);
    }
  }

  const canonicalIds = new Set(Array.from(canonicalByKey.values()).map((submission) => submission.id));
  return submissions.filter((submission) => canonicalIds.has(submission.id));
};

export const attachPartnerEventStats = async (
  supabase: PartnerEventStatsSupabase,
  events: PartnerEventLike[],
): Promise<Array<PartnerEventLike & PartnerEventStats>> => {
  if (events.length === 0) {
    return [];
  }

  const eventIds = Array.from(new Set(events.map((event) => event.id).filter(Boolean)));
  const { data: submissionRows, error: submissionsError } = await supabase
    .from("event_submissions")
    .select("id,event_id,user_id,created_at")
    .in("event_id", eventIds);

  if (submissionsError) {
    throw new Error(submissionsError.message ?? "Could not load event submissions.");
  }

  const submissions = (submissionRows ?? []) as PartnerEventSubmissionRow[];
  if (submissions.length === 0) {
    return events.map((event) => ({ ...event, ...emptyStats() }));
  }

  const submissionIds = submissions.map((submission) => submission.id).filter(Boolean);

  if (submissionIds.length === 0) {
    return events.map((event) => ({ ...event, ...emptyStats() }));
  }

  const { data: draftRows, error: draftsError } = await supabase
    .from("event_checkout_drafts")
    .select("submission_id,amount_cents,status,updated_at,created_at")
    .in("submission_id", submissionIds);

  if (draftsError) {
    throw new Error(draftsError.message ?? "Could not load event payment drafts.");
  }

  const bestSuccessfulDraftBySubmissionId = getBestSuccessfulDraftBySubmissionId(
    (draftRows ?? []) as PartnerEventCheckoutDraftRow[],
  );
  const canonicalSubmissions = collapsePartnerSubmissions(submissions, bestSuccessfulDraftBySubmissionId);
  const statsByEventId = new Map<string, PartnerEventStats>();
  const canonicalSubmissionEventById = new Map(canonicalSubmissions.map((submission) => [submission.id, submission.event_id]));

  for (const submission of canonicalSubmissions) {
    if (!submission.event_id) continue;
    const current = statsByEventId.get(submission.event_id) ?? emptyStats();
    current.signup_count += 1;
    statsByEventId.set(submission.event_id, current);
  }

  for (const [submissionId, draft] of bestSuccessfulDraftBySubmissionId) {
    const eventId = canonicalSubmissionEventById.get(submissionId);
    if (!eventId) continue;

    const current = statsByEventId.get(eventId) ?? emptyStats();
    current.paid_signup_count += 1;
    current.earned_amount_cents += draft.amount_cents ?? 0;
    statsByEventId.set(eventId, current);
  }

  return events.map((event) => ({
    ...event,
    ...(statsByEventId.get(event.id) ?? emptyStats()),
  }));
};
