import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedProfile, getSupabaseWithToken } from "@/lib/admin-route-auth";
import {
  getPartnerApplicationPlanDetails,
  sanitizePartnerApplicationSubmission,
  validatePartnerApplicationSubmission,
} from "@/lib/partner-application";
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
  createSquarePaymentLink,
  getAppUrl,
  getSquareLocationId,
  searchSquarePaymentByOrderId,
} from "@/lib/square";

export const runtime = "nodejs";

type PartnerApplyRequestBody = Partial<{
  application: unknown;
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

export async function GET(req: NextRequest) {
  try {
    const profile = await getAuthenticatedProfile(req);
    if (!profile) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    await markStalePartnerApplicationDraftsExpired();

    const draftId = req.nextUrl.searchParams.get("draftId")?.trim() || "";
    if (draftId) {
      const draft = await readPartnerApplicationDraft(draftId);
      if (!draft || draft.userId !== profile.id) {
        return NextResponse.json({ error: "Application draft not found." }, { status: 404 });
      }

      const nextDraft = await reconcileDraft(draft);
      return NextResponse.json({
        ok: true,
        draftId: nextDraft.id,
        status: nextDraft.status,
        error: nextDraft.errorMessage ?? null,
        checkoutUrl: nextDraft.squareCheckoutUrl ?? null,
        completedAt: nextDraft.completedAt ?? null,
      });
    }

    const latestDraft = await findLatestPartnerApplicationDraftForUser(profile.id);
    if (!latestDraft) {
      return NextResponse.json({ ok: true, draft: null });
    }

    const nextDraft = await reconcileDraft(latestDraft);
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
