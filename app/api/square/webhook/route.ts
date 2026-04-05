import { NextRequest, NextResponse } from "next/server";

import { getSupabaseServiceRole } from "@/lib/admin-route-auth";
import {
  finalizePartnerApplicationDraft,
  findPartnerApplicationDraftBySquareOrderId,
  markPartnerApplicationDraftFailed,
  type PartnerApplicationDraft,
} from "@/lib/partner-application-store";
import { getSquareWebhookNotificationUrl, verifySquareWebhookSignature } from "@/lib/square";
import type {
  Event,
  EventCheckoutDraft,
  EventCheckoutDraftUpdate,
  EventSubmission,
  EventSubmissionInsert,
  SundayLeagueTeam,
  SundayLeagueTeamCheckoutDraft,
  SundayLeagueTeamCheckoutDraftUpdate,
  SundayLeagueTeamInsert,
} from "@/lib/supabase/types";

export const runtime = "nodejs";

type SquarePaymentWebhookEvent = {
  type?: string;
  data?: {
    object?: {
      payment?: {
        id?: string;
        status?: string;
        order_id?: string;
      };
    };
  };
};

const getDraftPayload = (draft: SundayLeagueTeamCheckoutDraft): SundayLeagueTeamInsert | null => {
  const payload = draft.team_payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload as unknown as SundayLeagueTeamInsert;
};

const getEventDraftPayload = (draft: EventCheckoutDraft): EventSubmissionInsert | null => {
  const payload = draft.submission_payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload as unknown as EventSubmissionInsert;
};

const processSundayLeaguePayment = async ({
  serviceClient,
  payment,
  draft,
}: {
  serviceClient: NonNullable<ReturnType<typeof getSupabaseServiceRole>>;
  payment: { id?: string; status?: string; order_id?: string };
  draft: SundayLeagueTeamCheckoutDraft;
}) => {
  if (draft.status === "completed" && draft.team_id) {
    return;
  }

  if (payment.status !== "COMPLETED") {
    if (payment.status === "CANCELED" || payment.status === "FAILED") {
      await serviceClient
        .from("sunday_league_team_checkout_drafts")
        .update({
          status: "failed",
          square_payment_id: payment.id ?? null,
          error_message: `Square marked the payment as ${payment.status.toLowerCase()}.`,
        } satisfies SundayLeagueTeamCheckoutDraftUpdate)
        .eq("id", draft.id);
    }

    return;
  }

  const teamPayload = getDraftPayload(draft);
  if (!teamPayload) {
    await serviceClient
      .from("sunday_league_team_checkout_drafts")
      .update({
        status: "failed",
        square_payment_id: payment.id ?? null,
        error_message: "The checkout draft is missing the team payload.",
      } satisfies SundayLeagueTeamCheckoutDraftUpdate)
      .eq("id", draft.id);
    return;
  }

  const { data: existingTeamById } = draft.team_id
    ? await serviceClient
        .from("sunday_league_teams")
        .select("id")
        .eq("id", draft.team_id)
        .maybeSingle()
    : { data: null };

  if (existingTeamById?.id) {
    await serviceClient
      .from("sunday_league_team_checkout_drafts")
      .update({
        status: "completed",
        square_payment_id: payment.id ?? null,
        completed_at: draft.completed_at ?? new Date().toISOString(),
      } satisfies SundayLeagueTeamCheckoutDraftUpdate)
      .eq("id", draft.id);
    return;
  }

  const { data: slotTeam } = await serviceClient
    .from("sunday_league_teams")
    .select("id")
    .eq("division", draft.division)
    .eq("slot_number", draft.slot_number)
    .maybeSingle();

  if (slotTeam?.id) {
    await serviceClient
      .from("sunday_league_team_checkout_drafts")
      .update({
        status: "failed",
        square_payment_id: payment.id ?? null,
        error_message: "Payment was received, but the reserved Sunday League slot is no longer available.",
      } satisfies SundayLeagueTeamCheckoutDraftUpdate)
      .eq("id", draft.id);
    return;
  }

  const { data: createdTeam, error: createError } = await serviceClient
    .from("sunday_league_teams")
    .insert(teamPayload)
    .select("*")
    .single();

  if (createError || !createdTeam) {
    await serviceClient
      .from("sunday_league_team_checkout_drafts")
      .update({
        status: "failed",
        square_payment_id: payment.id ?? null,
        error_message: createError?.message ?? "Payment was received, but the team could not be created.",
      } satisfies SundayLeagueTeamCheckoutDraftUpdate)
      .eq("id", draft.id);
    return;
  }

  const team = createdTeam as SundayLeagueTeam;
  await serviceClient
    .from("sunday_league_team_checkout_drafts")
    .update({
      status: "completed",
      square_payment_id: payment.id ?? null,
      team_id: team.id,
      completed_at: new Date().toISOString(),
      error_message: null,
    } satisfies SundayLeagueTeamCheckoutDraftUpdate)
    .eq("id", draft.id);
};

const processEventPayment = async ({
  serviceClient,
  payment,
  draft,
}: {
  serviceClient: NonNullable<ReturnType<typeof getSupabaseServiceRole>>;
  payment: { id?: string; status?: string; order_id?: string };
  draft: EventCheckoutDraft;
}) => {
  if (draft.status === "completed" && draft.submission_id) {
    return;
  }

  if (payment.status !== "COMPLETED") {
    if (payment.status === "CANCELED" || payment.status === "FAILED") {
      await serviceClient
        .from("event_checkout_drafts")
        .update({
          status: "failed",
          square_payment_id: payment.id ?? null,
          error_message: `Square marked the payment as ${payment.status.toLowerCase()}.`,
        } satisfies EventCheckoutDraftUpdate)
        .eq("id", draft.id);
    }

    return;
  }

  const submissionPayload = getEventDraftPayload(draft);
  if (!submissionPayload) {
    await serviceClient
      .from("event_checkout_drafts")
      .update({
        status: "failed",
        square_payment_id: payment.id ?? null,
        error_message: "The checkout draft is missing the event submission payload.",
      } satisfies EventCheckoutDraftUpdate)
      .eq("id", draft.id);
    return;
  }

  const { data: eventRow } = await serviceClient
    .from("events")
    .select("id,registration_enabled,allow_multiple_registrations,registration_limit")
    .eq("id", draft.event_id)
    .maybeSingle();

  const eventConfig = eventRow as Pick<Event, "id" | "registration_enabled" | "allow_multiple_registrations" | "registration_limit"> | null;
  if (!eventConfig?.id || !eventConfig.registration_enabled) {
    await serviceClient
      .from("event_checkout_drafts")
      .update({
        status: "failed",
        square_payment_id: payment.id ?? null,
        error_message: "Payment was received, but event registration is no longer available.",
      } satisfies EventCheckoutDraftUpdate)
      .eq("id", draft.id);
    return;
  }

  const { data: existingSubmissionById } = draft.submission_id
    ? await serviceClient
        .from("event_submissions")
        .select("id")
        .eq("id", draft.submission_id)
        .maybeSingle()
    : { data: null };

  if (existingSubmissionById?.id) {
    await serviceClient
      .from("event_checkout_drafts")
      .update({
        status: "completed",
        square_payment_id: payment.id ?? null,
        completed_at: draft.completed_at ?? new Date().toISOString(),
      } satisfies EventCheckoutDraftUpdate)
      .eq("id", draft.id);
    return;
  }

  if (!eventConfig.allow_multiple_registrations) {
    const { data: existingSuccessfulDraft } = await serviceClient
      .from("event_checkout_drafts")
      .select("id,submission_id")
      .eq("event_id", draft.event_id)
      .eq("user_id", draft.user_id)
      .neq("id", draft.id)
      .in("status", ["paid", "completed"])
      .order("completed_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (existingSuccessfulDraft?.submission_id) {
      await serviceClient
        .from("event_checkout_drafts")
        .update({
          status: "completed",
          square_payment_id: payment.id ?? null,
          submission_id: existingSuccessfulDraft.submission_id,
          completed_at: draft.completed_at ?? new Date().toISOString(),
          error_message: null,
        } satisfies EventCheckoutDraftUpdate)
        .eq("id", draft.id);
      return;
    }
  }

  if (eventConfig.registration_limit && eventConfig.registration_limit > 0) {
    const { count } = await serviceClient
      .from("event_submissions")
      .select("id", { count: "exact", head: true })
      .eq("event_id", draft.event_id);

    if ((count ?? 0) >= eventConfig.registration_limit) {
      await serviceClient
        .from("event_checkout_drafts")
        .update({
          status: "failed",
          square_payment_id: payment.id ?? null,
          error_message: "Payment was received, but event registration is now full.",
        } satisfies EventCheckoutDraftUpdate)
        .eq("id", draft.id);
      return;
    }
  }

  const { data: createdSubmission, error: createError } = await serviceClient
    .from("event_submissions")
    .insert({
      ...submissionPayload,
      id: draft.id,
    })
    .select("*")
    .single();

  if (createError || !createdSubmission) {
    const { data: existingCreatedSubmission } = await serviceClient
      .from("event_submissions")
      .select("*")
      .eq("id", draft.id)
      .maybeSingle();

    if (existingCreatedSubmission) {
      await serviceClient
        .from("event_checkout_drafts")
        .update({
          status: "completed",
          square_payment_id: payment.id ?? null,
          submission_id: existingCreatedSubmission.id,
          completed_at: new Date().toISOString(),
          error_message: null,
        } satisfies EventCheckoutDraftUpdate)
        .eq("id", draft.id);
      return;
    }

    await serviceClient
      .from("event_checkout_drafts")
      .update({
        status: "failed",
        square_payment_id: payment.id ?? null,
        error_message: createError?.message ?? "Payment was received, but the registration could not be created.",
      } satisfies EventCheckoutDraftUpdate)
      .eq("id", draft.id);
    return;
  }

  const submission = createdSubmission as EventSubmission;
  await serviceClient
    .from("event_checkout_drafts")
    .update({
      status: "completed",
      square_payment_id: payment.id ?? null,
      submission_id: submission.id,
      completed_at: new Date().toISOString(),
      error_message: null,
    } satisfies EventCheckoutDraftUpdate)
    .eq("id", draft.id);
};

const processPartnerApplicationPayment = async ({
  payment,
  draft,
}: {
  payment: { id?: string; status?: string; order_id?: string };
  draft: PartnerApplicationDraft;
}) => {
  if (draft.status === "completed") {
    return;
  }

  if (payment.status === "COMPLETED") {
    await finalizePartnerApplicationDraft({
      draft,
      squarePaymentId: payment.id ?? null,
    });
    return;
  }

  if (payment.status === "CANCELED" || payment.status === "FAILED") {
    await markPartnerApplicationDraftFailed(
      draft,
      `Square marked the application payment as ${payment.status.toLowerCase()}.`,
    );
  }
};

export async function POST(req: NextRequest) {
  const signatureHeader = req.headers.get("x-square-hmacsha256-signature") || "";
  const requestBody = await req.text();
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY?.trim() || "";
  const notificationUrl = getSquareWebhookNotificationUrl();

  if (
    !verifySquareWebhookSignature({
      requestBody,
      signatureHeader,
      signatureKey,
      notificationUrl,
    })
  ) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
  }

  try {
    const event = JSON.parse(requestBody) as SquarePaymentWebhookEvent;
    const payment = event.data?.object?.payment;

    if (event.type !== "payment.updated" || !payment?.order_id) {
      return NextResponse.json({ ok: true });
    }

    const serviceClient = getSupabaseServiceRole();
    if (!serviceClient) {
      return NextResponse.json({ error: "Server Supabase service role is not configured." }, { status: 500 });
    }

    const { data: sundayData, error: sundayError } = await serviceClient
      .from("sunday_league_team_checkout_drafts")
      .select("*")
      .eq("square_order_id", payment.order_id)
      .maybeSingle();

    if (sundayError) {
      return NextResponse.json({ error: sundayError.message }, { status: 500 });
    }

    if (sundayData) {
      await processSundayLeaguePayment({
        serviceClient,
        payment,
        draft: sundayData as SundayLeagueTeamCheckoutDraft,
      });
      return NextResponse.json({ ok: true });
    }

    const { data: eventData, error: eventError } = await serviceClient
      .from("event_checkout_drafts")
      .select("*")
      .eq("square_order_id", payment.order_id)
      .maybeSingle();

    if (eventError) {
      return NextResponse.json({ error: eventError.message }, { status: 500 });
    }

    if (eventData) {
      await processEventPayment({
        serviceClient,
        payment,
        draft: eventData as EventCheckoutDraft,
      });
      return NextResponse.json({ ok: true });
    }

    const partnerApplicationDraft = await findPartnerApplicationDraftBySquareOrderId(payment.order_id);
    if (partnerApplicationDraft) {
      await processPartnerApplicationPayment({
        payment,
        draft: partnerApplicationDraft,
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not process the Square webhook." }, { status: 500 });
  }
}
