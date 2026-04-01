import { NextRequest, NextResponse } from "next/server";

import { getSupabaseServiceRole } from "@/lib/admin-route-auth";
import { getSquareWebhookNotificationUrl, verifySquareWebhookSignature } from "@/lib/square";
import type {
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

    const { data, error } = await serviceClient
      .from("sunday_league_team_checkout_drafts")
      .select("*")
      .eq("square_order_id", payment.order_id)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ ok: true });
    }

    const draft = data as SundayLeagueTeamCheckoutDraft;
    if (draft.status === "completed" && draft.team_id) {
      return NextResponse.json({ ok: true });
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

      return NextResponse.json({ ok: true });
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
      return NextResponse.json({ ok: true });
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
      return NextResponse.json({ ok: true });
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
      return NextResponse.json({ ok: true });
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
      return NextResponse.json({ ok: true });
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

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not process the Square webhook." }, { status: 500 });
  }
}
