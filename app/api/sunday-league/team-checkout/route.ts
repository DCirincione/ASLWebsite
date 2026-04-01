import { NextRequest, NextResponse } from "next/server";

import { getBearerToken, getSupabaseServiceRole, getSupabaseWithToken } from "@/lib/admin-route-auth";
import { createSquarePaymentLink, getAppUrl, getSquareLocationId } from "@/lib/square";
import { readSundayLeagueSignupForm } from "@/lib/sunday-league-signup-form-store";
import { SUNDAY_LEAGUE_DEPOSIT_CURRENCY } from "@/lib/sunday-league-settings-shared";
import { readSundayLeagueSettings } from "@/lib/sunday-league-settings";
import {
  SUNDAY_LEAGUE_CHECKOUT_WINDOW_MS,
  buildSundayLeagueTeamCheckoutPayload,
  isSundayLeagueDivision,
  sanitizeCheckoutFormValues,
  sanitizeUploadedFileMap,
  validateSundayLeagueCheckoutInput,
} from "@/lib/sunday-league-team-checkout";
import { getNextOpenSundayLeagueSlot, SUNDAY_LEAGUE_SLOT_COUNT } from "@/lib/sunday-league";
import type {
  SundayLeagueTeam,
  SundayLeagueTeamCheckoutDraft,
} from "@/lib/supabase/types";

export const runtime = "nodejs";

const STALE_DRAFT_AGE_MS = SUNDAY_LEAGUE_CHECKOUT_WINDOW_MS;

const getCurrentUserId = async (req: NextRequest) => {
  const token = getBearerToken(req);
  if (!token) return null;

  const userClient = getSupabaseWithToken(token);
  if (!userClient) return null;

  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user?.id) return null;

  return data.user.id;
};

const markStaleDraftsExpired = async () => {
  const serviceClient = getSupabaseServiceRole();
  if (!serviceClient) return;

  const staleBefore = new Date(Date.now() - STALE_DRAFT_AGE_MS).toISOString();
  await serviceClient
    .from("sunday_league_team_checkout_drafts")
    .update({
      status: "expired",
      error_message: "Checkout window expired before payment was completed.",
    })
    .eq("status", "pending")
    .lt("created_at", staleBefore);
};

export async function GET(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const draftId = req.nextUrl.searchParams.get("draftId")?.trim() || "";
    if (!draftId) {
      return NextResponse.json({ error: "Draft ID is required." }, { status: 400 });
    }

    const serviceClient = getSupabaseServiceRole();
    if (!serviceClient) {
      return NextResponse.json({ error: "Server Supabase service role is not configured." }, { status: 500 });
    }

    const { data, error } = await serviceClient
      .from("sunday_league_team_checkout_drafts")
      .select("id,status,team_id,error_message,team_payload,square_checkout_url,created_at")
      .eq("id", draftId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Checkout draft not found." }, { status: 404 });
    }

    const draft = data as Pick<
      SundayLeagueTeamCheckoutDraft,
      "id" | "status" | "team_id" | "error_message" | "square_checkout_url" | "created_at"
    >;

    return NextResponse.json({
      ok: true,
      draftId: draft.id,
      status: draft.status ?? "pending",
      teamId: draft.team_id ?? null,
      error: draft.error_message ?? null,
      checkoutUrl: draft.square_checkout_url ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Could not load checkout status." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const serviceClient = getSupabaseServiceRole();
    if (!serviceClient) {
      return NextResponse.json({ error: "Server Supabase service role is not configured." }, { status: 500 });
    }

    const appUrl = getAppUrl();
    const squareLocationId = getSquareLocationId();
    if (!appUrl) {
      return NextResponse.json({ error: "APP_URL is not configured." }, { status: 500 });
    }
    if (!squareLocationId) {
      return NextResponse.json({ error: "SQUARE_LOCATION_ID is not configured." }, { status: 500 });
    }

    await markStaleDraftsExpired();

    const body = (await req.json()) as Partial<{
      division: number;
      values: unknown;
      uploadedFiles: unknown;
    }>;

    if (!isSundayLeagueDivision(body.division)) {
      return NextResponse.json({ error: "A valid division is required." }, { status: 400 });
    }

    const [signupForm, sundayLeagueSettings] = await Promise.all([
      readSundayLeagueSignupForm(),
      readSundayLeagueSettings(),
    ]);
    const values = sanitizeCheckoutFormValues(body.values);
    const uploadedFiles = sanitizeUploadedFileMap(body.uploadedFiles);
    const validationError = validateSundayLeagueCheckoutInput({
      signupForm,
      values,
      uploadedFiles,
    });

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const [{ data: existingTeam }, { data: existingCoCaptainMembership }, { data: existingDraft }] = await Promise.all([
      serviceClient
        .from("sunday_league_teams")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
      serviceClient
        .from("sunday_league_team_members")
        .select("id")
        .eq("player_user_id", userId)
        .eq("status", "accepted")
        .eq("role", "co_captain")
        .limit(1)
        .maybeSingle(),
      serviceClient
        .from("sunday_league_team_checkout_drafts")
        .select("id,status,square_checkout_url")
        .eq("user_id", userId)
        .in("status", ["pending", "paid"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (existingTeam || existingCoCaptainMembership) {
      return NextResponse.json(
        { error: "You already manage a Sunday League team. Open your portal to continue." },
        { status: 400 }
      );
    }

    if (existingDraft?.square_checkout_url) {
      return NextResponse.json({
        ok: true,
        draftId: existingDraft.id,
        checkoutUrl: existingDraft.square_checkout_url,
      });
    }

    if (existingDraft?.id) {
      await serviceClient
        .from("sunday_league_team_checkout_drafts")
        .update({
          status: "expired",
          error_message: "A new checkout attempt was started.",
        })
        .eq("id", existingDraft.id);
    }

    const [{ data: teamsData }, { data: draftsData }] = await Promise.all([
      serviceClient
        .from("sunday_league_teams")
        .select("division,slot_number")
        .eq("division", body.division),
      serviceClient
        .from("sunday_league_team_checkout_drafts")
        .select("division,slot_number")
        .eq("division", body.division)
        .in("status", ["pending", "paid"]),
    ]);

    const occupiedSlots = [
      ...((teamsData ?? []) as Array<Pick<SundayLeagueTeam, "division" | "slot_number">>),
      ...((draftsData ?? []) as Array<Pick<SundayLeagueTeamCheckoutDraft, "division" | "slot_number">>),
    ].map((entry) => ({
      id: `${entry.division}-${entry.slot_number}`,
      division: entry.division,
      slot_number: entry.slot_number,
    })) as SundayLeagueTeam[];

    const slotNumber = getNextOpenSundayLeagueSlot(occupiedSlots, body.division, SUNDAY_LEAGUE_SLOT_COUNT);
    if (!slotNumber) {
      return NextResponse.json({ error: `Division ${body.division} is currently full.` }, { status: 409 });
    }

    const teamPayload = buildSundayLeagueTeamCheckoutPayload({
      signupForm,
      userId,
      division: body.division,
      slotNumber,
      values,
      uploadedFiles,
    });

    const { data: insertedDraft, error: insertError } = await serviceClient
      .from("sunday_league_team_checkout_drafts")
      .insert({
        user_id: userId,
        division: body.division,
        slot_number: slotNumber,
        status: "pending",
        amount_cents: sundayLeagueSettings.depositAmountCents,
        currency: SUNDAY_LEAGUE_DEPOSIT_CURRENCY,
        team_payload: teamPayload,
      })
      .select("*")
      .single();

    if (insertError || !insertedDraft) {
      const message = insertError?.message?.includes("duplicate")
        ? `Division ${body.division} just had another team reserve that slot. Try again.`
        : insertError?.message ?? "Could not start the team checkout.";
      return NextResponse.json({ error: message }, { status: 409 });
    }

    const draft = insertedDraft as SundayLeagueTeamCheckoutDraft;

    try {
      const redirectUrl = new URL("/leagues/sunday-league/deposit", appUrl);
      redirectUrl.searchParams.set("draftId", draft.id);

      const squareResponse = await createSquarePaymentLink({
        idempotency_key: draft.id,
        quick_pay: {
          name: `ASL Sunday League Division ${body.division} Deposit - ${teamPayload.team_name}`,
          price_money: {
            amount: sundayLeagueSettings.depositAmountCents,
            currency: SUNDAY_LEAGUE_DEPOSIT_CURRENCY,
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

      await serviceClient
        .from("sunday_league_team_checkout_drafts")
        .update({
          square_payment_link_id: paymentLinkId,
          square_checkout_url: checkoutUrl,
          square_order_id: orderId,
          error_message: null,
        })
        .eq("id", draft.id);

      return NextResponse.json({
        ok: true,
        draftId: draft.id,
        checkoutUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create the Square checkout link.";
      await serviceClient
        .from("sunday_league_team_checkout_drafts")
        .update({
          status: "failed",
          error_message: message,
        })
        .eq("id", draft.id);

      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: "Could not start the team checkout." }, { status: 500 });
  }
}
