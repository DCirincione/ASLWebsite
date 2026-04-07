import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedProfile, getSupabaseWithToken } from "@/lib/admin-route-auth";
import { createId } from "@/lib/create-id";
import {
  getPartnerApplicationPlanDetails,
  sanitizePartnerApplicationSubmission,
  validatePartnerApplicationSubmission,
} from "@/lib/partner-application";
import {
  createPartnerBillingAccount,
  readPartnerBillingAccount,
  writePartnerBillingAccount,
} from "@/lib/partner-billing-store";
import {
  createPartnerApplicationDraft,
  finalizePartnerApplicationDraft,
  findLatestPartnerApplicationDraftForUser,
  markPartnerApplicationDraftExpired,
  markPartnerApplicationDraftFailed,
  markStalePartnerApplicationDraftsExpired,
  readPartnerApplicationDraft,
  writePartnerApplicationDraft,
  type PartnerApplicationDraft,
} from "@/lib/partner-application-store";
import {
  createSquareCard,
  createSquareCustomer,
  createSquarePayment,
  createSquarePaymentLink,
  createSquareSubscription,
  getAppUrl,
  getSquareLocationId,
  getSquarePartnerStandardPlanVariationId,
  getSquarePartnerStandardPromoCode,
  getSquarePartnerStandardPromoPlanVariationId,
  searchSquarePaymentByOrderId,
} from "@/lib/square";

export const runtime = "nodejs";

type PartnerApplyRequestBody = Partial<{
  application: unknown;
  squareSourceId: string;
}>;

const getAccountEmail = async (token: string) => {
  const supabase = getSupabaseWithToken(token);
  if (!supabase) return "";

  const { data, error } = await supabase.auth.getUser(token);
  if (error) return "";
  return data.user?.email?.trim() ?? "";
};

const reconcileDraft = async (draft: PartnerApplicationDraft) => {
  if (draft.status !== "pending" || !draft.squareOrderId) {
    return draft;
  }

  const payment = await searchSquarePaymentByOrderId(draft.squareOrderId).catch(() => null);
  if (!payment?.status) {
    return draft;
  }

  if (payment.status === "COMPLETED") {
    return finalizePartnerApplicationDraft({
      draft,
      squarePaymentId: payment.id ?? null,
    });
  }

  if (payment.status === "CANCELED" || payment.status === "FAILED") {
    return markPartnerApplicationDraftFailed(
      draft,
      `Square marked the application payment as ${payment.status.toLowerCase()}.`,
    );
  }

  return draft;
};

const expireLegacyStandardCheckoutDraft = async (draft: PartnerApplicationDraft) => {
  if (
    draft.status === "pending" &&
    draft.application.selectedPlan === "standard" &&
    draft.squareCheckoutUrl
  ) {
    return markPartnerApplicationDraftExpired(
      draft,
      "This partner application used the old hosted Square checkout. Start a new application to use the in-page $75 first month, then $35/month billing flow.",
    );
  }

  return draft;
};

const buildPartnerCardholderName = (draft: PartnerApplicationDraft) =>
  `${draft.application.contactFirstName} ${draft.application.contactLastName}`.trim() ||
  draft.application.organizationName.trim() ||
  draft.profileName ||
  "ASL Partner Applicant";

const normalizePromoCode = (value: string) => value.trim().toUpperCase();

const resolveStandardPartnerPlanVariation = (promoCode: string) => {
  const defaultPlanVariationId = getSquarePartnerStandardPlanVariationId();
  if (!defaultPlanVariationId) {
    throw new Error("SQUARE_PARTNER_STANDARD_PLAN_VARIATION_ID is not configured.");
  }

  const normalizedPromoCode = normalizePromoCode(promoCode);
  if (!normalizedPromoCode) {
    return {
      planVariationId: defaultPlanVariationId,
      promoApplied: false,
    };
  }

  const configuredPromoCode = normalizePromoCode(getSquarePartnerStandardPromoCode());
  if (!configuredPromoCode || normalizedPromoCode !== configuredPromoCode) {
    throw new Error("Invalid partner promo code.");
  }

  const promoPlanVariationId = getSquarePartnerStandardPromoPlanVariationId();
  if (!promoPlanVariationId) {
    throw new Error("Partner promo billing is not configured.");
  }

  return {
    planVariationId: promoPlanVariationId,
    promoApplied: true,
  };
};

const getOrCreatePartnerBillingAccount = async ({
  userId,
  profileName,
  accountEmail,
  application,
}: {
  userId: string;
  profileName: string;
  accountEmail: string;
  application: ReturnType<typeof sanitizePartnerApplicationSubmission>;
}) => {
  const existingAccount = await readPartnerBillingAccount(userId).catch(() => null);
  if (existingAccount?.squareCustomerId) {
    return existingAccount;
  }

  const customerResponse = await createSquareCustomer({
    idempotency_key: createId(),
    given_name: application.contactFirstName,
    family_name: application.contactLastName,
    email_address: application.contactEmail || accountEmail || undefined,
    phone_number: application.contactPhone || undefined,
    company_name: application.organizationName,
    reference_id: userId,
    note: `ASL partner application for ${application.organizationName || profileName || userId}`,
  });

  const customerId = customerResponse.customer?.id?.trim() || "";
  if (!customerId) {
    throw new Error("Square did not return a customer profile.");
  }

  return writePartnerBillingAccount(
    createPartnerBillingAccount({
      userId,
      squareCustomerId: customerId,
    }),
  );
};

export async function GET(req: NextRequest) {
  try {
    await markStalePartnerApplicationDraftsExpired();

    const draftId = req.nextUrl.searchParams.get("draftId")?.trim() || "";
    if (draftId) {
      const profile = await getAuthenticatedProfile(req);
      const draft = await readPartnerApplicationDraft(draftId);
      if (!draft) {
        return NextResponse.json({ error: "Application draft not found." }, { status: 404 });
      }
      if (profile && draft.userId !== profile.id) {
        return NextResponse.json({ error: "Application draft not found." }, { status: 404 });
      }

      const nextDraft = await expireLegacyStandardCheckoutDraft(await reconcileDraft(draft));
      return NextResponse.json({
        ok: true,
        draftId: nextDraft.id,
        status: nextDraft.status,
        error: nextDraft.errorMessage ?? null,
        checkoutUrl: profile && nextDraft.userId === profile.id ? nextDraft.squareCheckoutUrl ?? null : null,
        completedAt: nextDraft.completedAt ?? null,
      });
    }

    const profile = await getAuthenticatedProfile(req);
    if (!profile) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const latestDraft = await findLatestPartnerApplicationDraftForUser(profile.id);
    if (!latestDraft) {
      return NextResponse.json({ ok: true, draft: null });
    }

    const nextDraft = await expireLegacyStandardCheckoutDraft(await reconcileDraft(latestDraft));
    return NextResponse.json({
      ok: true,
      draft: {
        id: nextDraft.id,
        status: nextDraft.status,
        error: nextDraft.errorMessage ?? null,
        checkoutUrl: nextDraft.squareCheckoutUrl ?? null,
        completedAt: nextDraft.completedAt ?? null,
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not load the partner application status." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const profile = await getAuthenticatedProfile(req);
    if (!profile) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (profile.role === "partner" || profile.role === "admin" || profile.role === "owner") {
      return NextResponse.json({ error: "Your account already has partner access." }, { status: 400 });
    }

    const appUrl = getAppUrl();
    const squareLocationId = getSquareLocationId();
    if (!appUrl) {
      return NextResponse.json({ error: "APP_URL is not configured." }, { status: 500 });
    }
    if (!squareLocationId) {
      return NextResponse.json({ error: "SQUARE_LOCATION_ID is not configured." }, { status: 500 });
    }

    await markStalePartnerApplicationDraftsExpired();

    const body = (await req.json()) as PartnerApplyRequestBody;
    const application = sanitizePartnerApplicationSubmission(body.application);
    const squareSourceId = body.squareSourceId?.trim() || "";
    const validationError = validatePartnerApplicationSubmission(application);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const existingDraft = await findLatestPartnerApplicationDraftForUser(profile.id);
    if (existingDraft?.status === "completed") {
      return NextResponse.json(
        { error: "You already submitted a partner application. We will review it and follow up by email." },
        { status: 400 },
      );
    }
    if (existingDraft?.status === "pending") {
      await markPartnerApplicationDraftExpired(existingDraft, "A new application checkout attempt was started.");
    }

    const accountEmail = (await getAccountEmail(profile.token)) || "";
    const draft = await writePartnerApplicationDraft(
      createPartnerApplicationDraft({
        userId: profile.id,
        profileName: profile.name?.trim() || "",
        accountEmail,
        application,
        plan: application.selectedPlan,
      }),
    );

    if (application.selectedPlan === "standard" && !squareSourceId) {
      const message =
        "Standard partner billing requires the secure card form on the page. Add the Square public config and try again.";
      await markPartnerApplicationDraftFailed(draft, message);
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (squareSourceId) {
      try {
        if (application.selectedPlan === "standard") {
          const { planVariationId, promoApplied } = resolveStandardPartnerPlanVariation(application.promoCode);

          const billingAccount = await getOrCreatePartnerBillingAccount({
            userId: profile.id,
            profileName: profile.name?.trim() || "",
            accountEmail,
            application,
          });

          const cardResponse = await createSquareCard({
            idempotency_key: createId(),
            source_id: squareSourceId,
            card: {
              customer_id: billingAccount.squareCustomerId,
              cardholder_name: buildPartnerCardholderName(draft),
            },
            reference_id: profile.id,
          });

          const card = cardResponse.card;
          const cardId = card?.id?.trim() || "";
          if (!cardId) {
            throw new Error("Square did not return a saved card.");
          }

          const subscriptionResponse = await createSquareSubscription({
            idempotency_key: draft.id,
            location_id: squareLocationId,
            plan_variation_id: planVariationId,
            customer_id: billingAccount.squareCustomerId,
            card_id: cardId,
            source: {
              name: "Aldrich Sports Partner Portal",
            },
          });

          const subscription = subscriptionResponse.subscription;
          const subscriptionId = subscription?.id?.trim() || "";
          if (!subscriptionId) {
            throw new Error("Square did not return a subscription.");
          }

          await writePartnerBillingAccount({
            ...billingAccount,
            squareCardId: cardId,
            squareSubscriptionId: subscriptionId,
            squarePlanVariationId: subscription?.plan_variation_id?.trim() || planVariationId,
            subscriptionStatus: subscription?.status?.trim() || null,
            cardBrand: card?.card_brand?.trim() || null,
            cardLast4: card?.last_4?.trim() || null,
            cardExpMonth: typeof card?.exp_month === "number" ? card.exp_month : null,
            cardExpYear: typeof card?.exp_year === "number" ? card.exp_year : null,
            lastPaidAt: new Date().toISOString(),
          });

          const completedDraft = await finalizePartnerApplicationDraft({
            draft,
            squarePaymentId: null,
          });

          return NextResponse.json({
            ok: true,
            submitted: true,
            draftId: completedDraft.id,
            subscriptionId,
            message:
              promoApplied
                ? "Application submitted. Your promo code was applied and monthly billing is active."
                : "Application submitted. Your card was saved, the first month was charged, and monthly billing is active.",
          });
        }

        const paymentResponse = await createSquarePayment({
          idempotency_key: draft.id,
          source_id: squareSourceId,
          amount_money: {
            amount: draft.amountCents,
            currency: draft.currency,
          },
          location_id: squareLocationId,
          autocomplete: true,
          reference_id: draft.id,
          note: `ASL partner application - ${application.organizationName}`,
          ...(application.contactEmail || accountEmail
            ? {
                buyer_email_address: application.contactEmail || accountEmail,
              }
            : {}),
        });

        const paymentId = paymentResponse.payment?.id?.trim() || null;
        const completedDraft = await finalizePartnerApplicationDraft({
          draft,
          squarePaymentId: paymentId,
        });

        return NextResponse.json({
          ok: true,
          submitted: true,
          draftId: completedDraft.id,
          paymentId,
          message: "Application submitted and your payment was received.",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not process the partner application payment.";
        await markPartnerApplicationDraftFailed(draft, message);
        return NextResponse.json({ error: message }, { status: 502 });
      }
    }

    try {
      const redirectUrl = new URL("/partner/apply/checkout", appUrl);
      redirectUrl.searchParams.set("draftId", draft.id);

      const planDetails = getPartnerApplicationPlanDetails(application.selectedPlan);
      const squareResponse = await createSquarePaymentLink({
        idempotency_key: draft.id,
        quick_pay: {
          name: `ASL Partner Application - ${application.organizationName}`,
          price_money: {
            amount: planDetails.checkoutAmountCents,
            currency: draft.currency,
          },
          location_id: squareLocationId,
        },
        checkout_options: {
          redirect_url: redirectUrl.toString(),
        },
      });

      const paymentLinkId = squareResponse?.payment_link?.id?.trim() || null;
      const checkoutUrl = squareResponse?.payment_link?.url?.trim() || null;
      const orderId =
        squareResponse?.payment_link?.order_id?.trim() ||
        squareResponse?.related_resources?.orders?.[0]?.id?.trim() ||
        null;

      if (!checkoutUrl) {
        throw new Error("Square did not return a checkout URL.");
      }

      const nextDraft = await writePartnerApplicationDraft({
        ...draft,
        squarePaymentLinkId: paymentLinkId,
        squareCheckoutUrl: checkoutUrl,
        squareOrderId: orderId,
        errorMessage: null,
      });

      return NextResponse.json({
        ok: true,
        draftId: nextDraft.id,
        checkoutUrl: nextDraft.squareCheckoutUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create the Square checkout link.";
      await markPartnerApplicationDraftFailed(draft, message);
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: "Could not submit the partner application." }, { status: 500 });
  }
}
