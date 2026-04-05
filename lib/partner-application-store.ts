import "server-only";

import { getSupabaseServiceRole } from "@/lib/admin-route-auth";
import { createId } from "@/lib/create-id";
import {
  formatPartnerApplicationSelection,
  getPartnerApplicationPlanDetails,
  PARTNER_APPLICATION_CHECKOUT_WINDOW_MS,
  PARTNER_APPLICATION_PAYMENT_CURRENCY,
  PARTNER_POSTING_TYPE_OPTIONS,
  PARTNER_SPORT_OPTIONS,
  type PartnerApplicationPlan,
  type PartnerApplicationSubmission,
} from "@/lib/partner-application";
import type { ContactMessageInsert } from "@/lib/supabase/types";

export type PartnerApplicationDraftStatus = "pending" | "completed" | "failed" | "expired";

export type PartnerApplicationDraft = {
  id: string;
  userId: string;
  profileName: string;
  accountEmail: string;
  status: PartnerApplicationDraftStatus;
  amountCents: number;
  currency: string;
  application: PartnerApplicationSubmission;
  squarePaymentLinkId?: string | null;
  squareCheckoutUrl?: string | null;
  squareOrderId?: string | null;
  squarePaymentId?: string | null;
  contactMessageId?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
};

const PARTNER_APPLICATION_DRAFT_PREFIX = "partner_application_draft:";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const formatMoney = (amountCents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: PARTNER_APPLICATION_PAYMENT_CURRENCY,
  }).format(amountCents / 100);

const getDraftKey = (draftId: string) => `${PARTNER_APPLICATION_DRAFT_PREFIX}${draftId}`;

const normalizeDraft = (value: unknown): PartnerApplicationDraft | null => {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const userId = typeof value.userId === "string" ? value.userId.trim() : "";
  const profileName = typeof value.profileName === "string" ? value.profileName.trim() : "";
  const accountEmail = typeof value.accountEmail === "string" ? value.accountEmail.trim() : "";
  const createdAt = typeof value.createdAt === "string" ? value.createdAt.trim() : "";
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt.trim() : "";
  if (!id || !userId || !createdAt || !updatedAt) return null;

  const application = value.application as PartnerApplicationSubmission | undefined;
  if (!application || !isRecord(application)) return null;

  return {
    id,
    userId,
    profileName,
    accountEmail,
    status:
      value.status === "completed" || value.status === "failed" || value.status === "expired"
        ? value.status
        : "pending",
    amountCents: typeof value.amountCents === "number" ? value.amountCents : 0,
    currency:
      typeof value.currency === "string" && value.currency.trim()
        ? value.currency.trim()
        : PARTNER_APPLICATION_PAYMENT_CURRENCY,
    application,
    squarePaymentLinkId: typeof value.squarePaymentLinkId === "string" ? value.squarePaymentLinkId.trim() : null,
    squareCheckoutUrl: typeof value.squareCheckoutUrl === "string" ? value.squareCheckoutUrl.trim() : null,
    squareOrderId: typeof value.squareOrderId === "string" ? value.squareOrderId.trim() : null,
    squarePaymentId: typeof value.squarePaymentId === "string" ? value.squarePaymentId.trim() : null,
    contactMessageId: typeof value.contactMessageId === "string" ? value.contactMessageId.trim() : null,
    errorMessage: typeof value.errorMessage === "string" ? value.errorMessage.trim() : null,
    createdAt,
    updatedAt,
    completedAt: typeof value.completedAt === "string" ? value.completedAt.trim() : null,
  };
};

const getSupabase = () => {
  const supabase = getSupabaseServiceRole();
  if (!supabase) {
    throw new Error("Supabase service role is not configured.");
  }
  return supabase;
};

const listDraftRows = async () => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("app_settings")
    .select("key,value")
    .like("key", `${PARTNER_APPLICATION_DRAFT_PREFIX}%`);

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<{ key?: string; value?: unknown }>;
};

export const createPartnerApplicationDraft = ({
  userId,
  profileName,
  accountEmail,
  application,
  plan,
}: {
  userId: string;
  profileName: string;
  accountEmail: string;
  application: PartnerApplicationSubmission;
  plan: PartnerApplicationPlan;
}): PartnerApplicationDraft => {
  const timestamp = new Date().toISOString();
  return {
    id: createId(),
    userId,
    profileName,
    accountEmail,
    status: "pending",
    amountCents: getPartnerApplicationPlanDetails(plan).checkoutAmountCents,
    currency: PARTNER_APPLICATION_PAYMENT_CURRENCY,
    application,
    squarePaymentLinkId: null,
    squareCheckoutUrl: null,
    squareOrderId: null,
    squarePaymentId: null,
    contactMessageId: null,
    errorMessage: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
  };
};

export const writePartnerApplicationDraft = async (draft: PartnerApplicationDraft) => {
  const supabase = getSupabase();
  const next = {
    ...draft,
    updatedAt: new Date().toISOString(),
  } satisfies PartnerApplicationDraft;

  const { error } = await supabase.from("app_settings").upsert(
    {
      key: getDraftKey(next.id),
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

export const readPartnerApplicationDraft = async (draftId: string) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", getDraftKey(draftId))
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizeDraft(data?.value);
};

export const listPartnerApplicationDrafts = async () =>
  (await listDraftRows())
    .map((row) => normalizeDraft(row.value))
    .filter((draft): draft is PartnerApplicationDraft => Boolean(draft));

export const findLatestPartnerApplicationDraftForUser = async (userId: string) => {
  const drafts = await listPartnerApplicationDrafts();
  return drafts
    .filter((draft) => draft.userId === userId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
};

export const findPartnerApplicationDraftBySquareOrderId = async (squareOrderId: string) => {
  const trimmedOrderId = squareOrderId.trim();
  if (!trimmedOrderId) return null;

  const drafts = await listPartnerApplicationDrafts();
  return drafts
    .filter((draft) => draft.squareOrderId === trimmedOrderId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
};

export const markPartnerApplicationDraftExpired = async (draft: PartnerApplicationDraft, errorMessage: string) =>
  writePartnerApplicationDraft({
    ...draft,
    status: "expired",
    errorMessage,
  });

export const markPartnerApplicationDraftFailed = async (draft: PartnerApplicationDraft, errorMessage: string) =>
  writePartnerApplicationDraft({
    ...draft,
    status: "failed",
    errorMessage,
  });

export const markStalePartnerApplicationDraftsExpired = async () => {
  const staleBefore = Date.now() - PARTNER_APPLICATION_CHECKOUT_WINDOW_MS;
  const drafts = await listPartnerApplicationDrafts();
  await Promise.all(
    drafts
      .filter((draft) => draft.status === "pending")
      .filter((draft) => new Date(draft.createdAt).getTime() < staleBefore)
      .map((draft) =>
        markPartnerApplicationDraftExpired(draft, "Checkout window expired before payment was completed."),
      ),
  );
};

const buildTeamMemberSummary = (application: PartnerApplicationSubmission) =>
  application.teamMembers.length > 0
    ? application.teamMembers
        .map((member, index) => {
          const fields = [
            member.name ? `Name: ${member.name}` : null,
            member.phone ? `Phone: ${member.phone}` : null,
            member.role ? `Role: ${member.role}` : null,
          ].filter(Boolean);

          return fields.length > 0 ? `${index + 1}. ${fields.join(" | ")}` : null;
        })
        .filter(Boolean)
        .join("\n")
    : "None provided";

const buildPartnerApplicationMessage = (draft: PartnerApplicationDraft) => {
  const application = draft.application;
  const plan = getPartnerApplicationPlanDetails(application.selectedPlan);

  return [
    "Partner application",
    `Submitted at: ${draft.completedAt ?? draft.updatedAt}`,
    `Application user ID: ${draft.userId}`,
    `Account profile name: ${draft.profileName || "Unknown"}`,
    `Account email: ${draft.accountEmail || "Unknown"}`,
    `Checkout amount paid: ${formatMoney(draft.amountCents)}`,
    `Selected plan: ${plan.label} (${plan.planDescription})`,
    "",
    "Organization Basics",
    `Organization Name: ${application.organizationName}`,
    `Logo / Profile Photo: ${application.logoUrl}`,
    `Description / Bio: ${application.description}`,
    `Website: ${application.website || "None"}`,
    `Instagram: ${application.instagram || "None"}`,
    `Other Social Link: ${application.otherSocialLink || "None"}`,
    "",
    "Primary Contact",
    `First Name: ${application.contactFirstName}`,
    `Last Name: ${application.contactLastName}`,
    `Role / Title: ${application.contactRole}`,
    `Phone Number: ${application.contactPhone}`,
    `Email: ${application.contactEmail}`,
    "",
    "Additional Team Members",
    buildTeamMemberSummary(application),
    "",
    "Sports & Categories",
    `Sports Offered: ${formatPartnerApplicationSelection(application.sportsOffered, PARTNER_SPORT_OPTIONS, application.otherSport)}`,
    "",
    "Posting Types",
    `Posting Types: ${formatPartnerApplicationSelection(application.postingTypes, PARTNER_POSTING_TYPE_OPTIONS, application.otherPostingType)}`,
    "",
    "Non-Profit Status",
    `Is non-profit: ${application.isNonProfit ? "Yes" : "No"}`,
    `Non-profit name: ${application.nonProfitName || "None"}`,
    `501(c)(3) / EIN / Registration #: ${application.nonProfitRegistrationNumber || "None"}`,
    "",
    "Terms",
    `Authorized to represent organization: ${application.termsAuthorized ? "Yes" : "No"}`,
    `Understands event submissions must be accurate / may require approval: ${application.termsAccuracy ? "Yes" : "No"}`,
    `Accepted Terms of Service: ${application.termsTos ? "Yes" : "No"}`,
  ].join("\n");
};

export const finalizePartnerApplicationDraft = async ({
  draft,
  squarePaymentId,
}: {
  draft: PartnerApplicationDraft;
  squarePaymentId?: string | null;
}) => {
  if (draft.status === "completed") {
    return draft;
  }

  const supabase = getSupabase();
  const completedAt = new Date().toISOString();
  const contactMessageId = draft.contactMessageId || createId();

  if (!draft.contactMessageId) {
    const payload: ContactMessageInsert = {
      id: contactMessageId,
      name: `${draft.application.organizationName} partner application`,
      email: draft.application.contactEmail || draft.accountEmail || "partner-application@asl.local",
      message: buildPartnerApplicationMessage({
        ...draft,
        completedAt,
      }),
      is_read: false,
      read_at: null,
    };

    const { error } = await supabase.from("contact_messages").insert(payload);
    if (error) {
      throw error;
    }
  }

  return writePartnerApplicationDraft({
    ...draft,
    status: "completed",
    contactMessageId,
    squarePaymentId: squarePaymentId?.trim() || draft.squarePaymentId || null,
    errorMessage: null,
    completedAt,
  });
};
