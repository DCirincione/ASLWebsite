import { NextRequest, NextResponse } from "next/server";

import { createId } from "@/lib/create-id";
import { createSquarePaymentLink, getAppUrl, getSquareLocationId } from "@/lib/square";

export const runtime = "nodejs";

type DonationCheckoutRequestBody = Partial<{
  amount: string | number;
}>;

const DONATION_CURRENCY = "USD";
const MIN_DONATION_CENTS = 100;
const MAX_DONATION_CENTS = 1_000_000;

const parseDonationAmountCents = (value: unknown) => {
  const rawValue = typeof value === "number" ? value.toFixed(2) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+(\.\d{1,2})?$/.test(rawValue)) return null;

  const [dollarsPart, centsPart = ""] = rawValue.split(".");
  const dollars = Number(dollarsPart);
  const cents = Number(centsPart.padEnd(2, "0"));
  if (!Number.isSafeInteger(dollars) || !Number.isSafeInteger(cents)) return null;

  const amountCents = dollars * 100 + cents;
  if (amountCents < MIN_DONATION_CENTS || amountCents > MAX_DONATION_CENTS) return null;
  return amountCents;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as DonationCheckoutRequestBody | null;
    const amountCents = parseDonationAmountCents(body?.amount);
    if (!amountCents) {
      return NextResponse.json(
        { error: "Enter a donation amount between $1.00 and $10,000.00." },
        { status: 400 },
      );
    }

    const appUrl = getAppUrl();
    const squareLocationId = getSquareLocationId();
    if (!appUrl) {
      return NextResponse.json({ error: "APP_URL is not configured." }, { status: 500 });
    }
    if (!squareLocationId) {
      return NextResponse.json({ error: "SQUARE_LOCATION_ID is not configured." }, { status: 500 });
    }

    const donationId = createId();
    const squareResponse = await createSquarePaymentLink({
      idempotency_key: donationId,
      description: "Aldrich Sports donation",
      payment_note: "Aldrich Sports community donation",
      quick_pay: {
        name: "Aldrich Sports Donation",
        price_money: {
          amount: amountCents,
          currency: DONATION_CURRENCY,
        },
        location_id: squareLocationId,
      },
      checkout_options: {
        redirect_url: `${appUrl}/community?donation=thanks`,
      },
    });

    const checkoutUrl = squareResponse.payment_link?.url?.trim() || "";
    if (!checkoutUrl) {
      return NextResponse.json({ error: "Square did not return a checkout URL." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      checkoutUrl,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start the donation checkout." },
      { status: 500 },
    );
  }
}
