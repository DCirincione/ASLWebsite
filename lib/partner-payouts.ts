import type { PartnerPayoutRequest } from "@/lib/supabase/types";

type PartnerPayoutEventLike = {
  earned_amount_cents?: number | null;
};

export const getPaidPartnerPayoutAmountCents = (requests: Pick<PartnerPayoutRequest, "amount_cents" | "status">[]) =>
  requests.reduce((sum, request) => sum + (request.status === "paid" ? request.amount_cents : 0), 0);

export const getPendingPartnerPayoutAmountCents = (requests: Pick<PartnerPayoutRequest, "amount_cents" | "status">[]) =>
  requests.reduce(
    (sum, request) => sum + (request.status === "requested" || request.status === "approved" ? request.amount_cents : 0),
    0,
  );

export const getPartnerEarnedAmountCents = (events: PartnerPayoutEventLike[]) =>
  events.reduce((sum, event) => sum + (event.earned_amount_cents ?? 0), 0);

export const getPartnerAvailablePayoutAmountCents = (
  events: PartnerPayoutEventLike[],
  requests: Pick<PartnerPayoutRequest, "amount_cents" | "status">[],
) => Math.max(0, getPartnerEarnedAmountCents(events) - getPaidPartnerPayoutAmountCents(requests) - getPendingPartnerPayoutAmountCents(requests));
