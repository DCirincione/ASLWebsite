import { NextRequest, NextResponse } from "next/server";

import { createId } from "@/lib/create-id";
import { getMerchShippingFeeCentsForSubtotal, readMerchCatalog } from "@/lib/printful";
import { readSiteSettings } from "@/lib/site-settings";
import { createSquarePaymentLink, getAppUrl, getSquareLocationId } from "@/lib/square";

export const runtime = "nodejs";

type MerchCheckoutRequestBody = Partial<{
  items: Array<{
    productId?: string;
    variantId?: string;
    quantity?: number;
  }>;
}>;

const SQUARE_REFERENCE_ID_MAX_LENGTH = 40;
const SQUARE_SHIPPING_FEE_NAME_MAX_LENGTH = 40;
const MERCH_ORDER_REFERENCE_PREFIX = "ASL-MERCH-";

const sanitizeCartItems = (value: unknown) => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];

    const item = entry as {
      productId?: unknown;
      variantId?: unknown;
      quantity?: unknown;
    };

    const productId = typeof item.productId === "string" ? item.productId.trim() : "";
    const variantId = typeof item.variantId === "string" ? item.variantId.trim() : "";
    const quantity =
      typeof item.quantity === "number" && Number.isFinite(item.quantity)
        ? Math.max(1, Math.min(10, Math.floor(item.quantity)))
        : 1;

    if (!productId || !variantId) return [];
    return [{ productId, variantId, quantity }];
  });
};

const truncateSquareText = (value: string, maxLength: number) => {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength).trimEnd();
};

const buildMerchOrderReferenceId = () => {
  const token = createId().replace(/[^a-z0-9]/gi, "");
  const suffixLength = Math.max(1, SQUARE_REFERENCE_ID_MAX_LENGTH - MERCH_ORDER_REFERENCE_PREFIX.length);
  return `${MERCH_ORDER_REFERENCE_PREFIX}${token.slice(0, suffixLength)}`;
};

export async function POST(req: NextRequest) {
  try {
    const siteSettings = await readSiteSettings();
    if (!siteSettings.merch.purchasesEnabled) {
      return NextResponse.json({ error: "Merch purchases are coming soon." }, { status: 403 });
    }

    const appUrl = getAppUrl();
    const squareLocationId = getSquareLocationId();
    if (!appUrl) {
      return NextResponse.json({ error: "APP_URL is not configured." }, { status: 500 });
    }
    if (!squareLocationId) {
      return NextResponse.json({ error: "SQUARE_LOCATION_ID is not configured." }, { status: 500 });
    }

    const body = (await req.json().catch(() => null)) as MerchCheckoutRequestBody | null;
    const cartItems = sanitizeCartItems(body?.items);
    if (cartItems.length === 0) {
      return NextResponse.json({ error: "Add at least one merch item before checkout." }, { status: 400 });
    }

    const catalog = await readMerchCatalog();
    if (!catalog.checkout.enabled) {
      return NextResponse.json(
        { error: catalog.checkout.statusMessage ?? "Merch checkout is not configured yet." },
        { status: 500 },
      );
    }

    const validatedItems = cartItems.flatMap((item) => {
      const product = catalog.products.find((entry) => entry.id === item.productId);
      const variant = product?.variants.find((entry) => entry.id === item.variantId);
      if (!product || !variant || !variant.externalId || !variant.checkoutReady) {
        return [];
      }

      return [{
        product,
        variant,
        quantity: item.quantity,
      }];
    });

    if (validatedItems.length !== cartItems.length) {
      return NextResponse.json(
        { error: "One or more merch selections are no longer available. Refresh the page and try again." },
        { status: 409 },
      );
    }

    const subtotalCents = validatedItems.reduce((sum, item) => {
      const unitPriceCents = item.variant.price != null ? Math.round(item.variant.price * 100) : 0;
      return sum + unitPriceCents * item.quantity;
    }, 0);
    const shippingFeeCents = getMerchShippingFeeCentsForSubtotal(subtotalCents, catalog.checkout.shippingRateTiers);

    const orderReferenceId = buildMerchOrderReferenceId();
    const squareResponse = await createSquarePaymentLink({
      idempotency_key: createId(),
      description: "Aldrich Sports merch checkout",
      payment_note: "Aldrich Sports merch checkout",
      order: {
        location_id: squareLocationId,
        reference_id: orderReferenceId,
        line_items: validatedItems.map((item) => ({
          catalog_object_id: item.variant.externalId,
          quantity: String(item.quantity),
        })),
      },
      checkout_options: {
        ask_for_shipping_address: true,
        redirect_url: `${appUrl}/merch/checkout/success`,
        ...(shippingFeeCents != null
          ? {
              shipping_fee: {
                name: truncateSquareText(
                  catalog.checkout.shippingFeeLabel || "Shipping",
                  SQUARE_SHIPPING_FEE_NAME_MAX_LENGTH,
                ),
                charge: {
                  amount: shippingFeeCents,
                  currency: catalog.checkout.currencyCode,
                },
              },
            }
          : {}),
      },
    });

    const checkoutUrl = squareResponse.payment_link?.url?.trim() || "";

    if (!checkoutUrl) {
      return NextResponse.json({ error: "Square did not return a checkout URL." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      checkoutUrl,
      orderReferenceId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start the merch checkout." },
      { status: 500 },
    );
  }
}
