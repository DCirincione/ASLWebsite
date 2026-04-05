import type { Event, EventCheckoutDraft, EventSubmission } from "@/lib/supabase/types";

export type EffectiveRegistrationSubmissionRow = Pick<EventSubmission, "id" | "event_id">;
export type EffectiveRegistrationEventRow = Pick<Event, "id" | "payment_required" | "payment_amount_cents">;
export type EffectiveRegistrationDraftRow = Pick<EventCheckoutDraft, "submission_id" | "status" | "updated_at" | "created_at">;

const getDraftTimestamp = (draft: Pick<EventCheckoutDraft, "updated_at" | "created_at">) =>
  draft.updated_at ?? draft.created_at ?? "";

export const isPaidEventRegistration = (event?: Pick<Event, "payment_required" | "payment_amount_cents"> | null) =>
  Boolean(event?.payment_required && (event.payment_amount_cents ?? 0) > 0);

export const getBestSuccessfulRegistrationDraftBySubmissionId = (
  drafts: EffectiveRegistrationDraftRow[],
) => {
  const bestDraftBySubmissionId = new Map<string, EffectiveRegistrationDraftRow>();

  for (const draft of drafts) {
    if (!draft.submission_id) continue;
    if (draft.status !== "paid" && draft.status !== "completed") continue;

    const existing = bestDraftBySubmissionId.get(draft.submission_id);
    if (!existing || getDraftTimestamp(draft) >= getDraftTimestamp(existing)) {
      bestDraftBySubmissionId.set(draft.submission_id, draft);
    }
  }

  return bestDraftBySubmissionId;
};

export const filterEffectiveRegisteredSubmissions = <T extends EffectiveRegistrationSubmissionRow>(
  submissions: T[],
  eventsById: Map<string, EffectiveRegistrationEventRow>,
  successfulDraftBySubmissionId: Map<string, EffectiveRegistrationDraftRow>,
) =>
  submissions.filter((submission) => {
    const event = eventsById.get(submission.event_id);
    if (!event) return false;
    if (!isPaidEventRegistration(event)) return true;
    return successfulDraftBySubmissionId.has(submission.id);
  });
