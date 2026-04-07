import "server-only";

import { getSupabaseServiceRole } from "@/lib/admin-route-auth";

export type PartnerBillingAccount = {
  userId: string;
  squareCustomerId: string;
  squareCardId?: string | null;
  squareSubscriptionId?: string | null;
  squarePlanVariationId?: string | null;
  subscriptionStatus?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  cardExpMonth?: number | null;
  cardExpYear?: number | null;
  lastPaymentId?: string | null;
  lastPaidAt?: string | null;
  lastChargeFailedAt?: string | null;
  lastChargeFailedReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

const PARTNER_BILLING_PREFIX = "partner_billing_account:";

const getSupabase = () => {
  const supabase = getSupabaseServiceRole();
  if (!supabase) {
    throw new Error("Supabase service role is not configured.");
  }
  return supabase;
};

const getBillingKey = (userId: string) => `${PARTNER_BILLING_PREFIX}${userId}`;

const normalizePartnerBillingAccount = (value: unknown): PartnerBillingAccount | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const userId = typeof record.userId === "string" ? record.userId.trim() : "";
  const squareCustomerId = typeof record.squareCustomerId === "string" ? record.squareCustomerId.trim() : "";
  const createdAt = typeof record.createdAt === "string" ? record.createdAt.trim() : "";
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt.trim() : "";

  if (!userId || !squareCustomerId || !createdAt || !updatedAt) return null;

  return {
    userId,
    squareCustomerId,
    squareCardId: typeof record.squareCardId === "string" ? record.squareCardId.trim() : null,
    squareSubscriptionId: typeof record.squareSubscriptionId === "string" ? record.squareSubscriptionId.trim() : null,
    squarePlanVariationId:
      typeof record.squarePlanVariationId === "string" ? record.squarePlanVariationId.trim() : null,
    subscriptionStatus: typeof record.subscriptionStatus === "string" ? record.subscriptionStatus.trim() : null,
    cardBrand: typeof record.cardBrand === "string" ? record.cardBrand.trim() : null,
    cardLast4: typeof record.cardLast4 === "string" ? record.cardLast4.trim() : null,
    cardExpMonth: typeof record.cardExpMonth === "number" ? record.cardExpMonth : null,
    cardExpYear: typeof record.cardExpYear === "number" ? record.cardExpYear : null,
    lastPaymentId: typeof record.lastPaymentId === "string" ? record.lastPaymentId.trim() : null,
    lastPaidAt: typeof record.lastPaidAt === "string" ? record.lastPaidAt.trim() : null,
    lastChargeFailedAt: typeof record.lastChargeFailedAt === "string" ? record.lastChargeFailedAt.trim() : null,
    lastChargeFailedReason:
      typeof record.lastChargeFailedReason === "string" ? record.lastChargeFailedReason.trim() : null,
    createdAt,
    updatedAt,
  };
};

const listBillingRows = async () => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("app_settings")
    .select("key,value")
    .like("key", `${PARTNER_BILLING_PREFIX}%`);

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<{ key?: string; value?: unknown }>;
};

export const readPartnerBillingAccount = async (userId: string) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", getBillingKey(userId))
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizePartnerBillingAccount(data?.value);
};

export const writePartnerBillingAccount = async (value: PartnerBillingAccount) => {
  const supabase = getSupabase();
  const next = {
    ...value,
    updatedAt: new Date().toISOString(),
  } satisfies PartnerBillingAccount;

  const { error } = await supabase.from("app_settings").upsert(
    {
      key: getBillingKey(next.userId),
      value: next,
      updated_at: next.updatedAt,
    },
    { onConflict: "key" },
  );

  if (error) {
    throw error;
  }

  return next;
};

export const createPartnerBillingAccount = ({
  userId,
  squareCustomerId,
}: {
  userId: string;
  squareCustomerId: string;
}) => {
  const timestamp = new Date().toISOString();
  return {
    userId,
    squareCustomerId: squareCustomerId.trim(),
    squareCardId: null,
    squareSubscriptionId: null,
    squarePlanVariationId: null,
    subscriptionStatus: null,
    cardBrand: null,
    cardLast4: null,
    cardExpMonth: null,
    cardExpYear: null,
    lastPaymentId: null,
    lastPaidAt: null,
    lastChargeFailedAt: null,
    lastChargeFailedReason: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  } satisfies PartnerBillingAccount;
};

export const findPartnerBillingAccountBySubscriptionId = async (subscriptionId: string) => {
  const trimmedSubscriptionId = subscriptionId.trim();
  if (!trimmedSubscriptionId) return null;

  const rows = await listBillingRows();
  return (
    rows
      .map((row) => normalizePartnerBillingAccount(row.value))
      .filter((value): value is PartnerBillingAccount => Boolean(value))
      .find((account) => account.squareSubscriptionId === trimmedSubscriptionId) ?? null
  );
};
