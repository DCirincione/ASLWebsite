import { createHmac, timingSafeEqual } from "crypto";

const SQUARE_API_VERSION = "2026-01-22";

type SquareError = {
  category?: string;
  code?: string;
  detail?: string;
};

const getSquareApiToken = () => process.env.SQUARE_ACCESS_TOKEN?.trim() || "";
const getSquareEnvironment = () => (process.env.SQUARE_ENVIRONMENT?.trim().toLowerCase() || "production");

const getSquareApiBaseUrl = () =>
  getSquareEnvironment() === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";

export const getSquareLocationId = () => process.env.SQUARE_LOCATION_ID?.trim() || "";

export const getAppUrl = () => (process.env.APP_URL?.trim() || "").replace(/\/+$/, "");

export const getSquareWebhookNotificationUrl = () => {
  const explicit = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL?.trim();
  if (explicit) return explicit;

  const appUrl = getAppUrl();
  return appUrl ? `${appUrl}/api/square/webhook` : "";
};

const getSquareHeaders = () => {
  const token = getSquareApiToken();
  if (!token) {
    throw new Error("SQUARE_ACCESS_TOKEN is not configured.");
  }

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Square-Version": SQUARE_API_VERSION,
  };
};

const getSquareErrorMessage = (errors: SquareError[] | undefined, fallback: string) => {
  const detail = errors?.map((error) => error.detail?.trim()).filter(Boolean).join(" ");
  return detail || fallback;
};

export const createSquarePaymentLink = async (body: Record<string, unknown>) => {
  const response = await fetch(`${getSquareApiBaseUrl()}/v2/online-checkout/payment-links`, {
    method: "POST",
    headers: getSquareHeaders(),
    body: JSON.stringify(body),
  });

  const json = (await response.json().catch(() => null)) as
    | {
        errors?: SquareError[];
        payment_link?: {
          id?: string;
          url?: string;
          order_id?: string;
        };
        related_resources?: {
          orders?: Array<{ id?: string }>;
        };
      }
    | null;

  if (!response.ok) {
    throw new Error(getSquareErrorMessage(json?.errors, "Could not create the Square checkout link."));
  }

  return json;
};

export const verifySquareWebhookSignature = ({
  requestBody,
  signatureHeader,
  signatureKey,
  notificationUrl,
}: {
  requestBody: string;
  signatureHeader: string;
  signatureKey: string;
  notificationUrl: string;
}) => {
  if (!signatureHeader || !signatureKey || !notificationUrl) return false;

  const digest = createHmac("sha256", signatureKey)
    .update(notificationUrl)
    .update(requestBody)
    .digest("base64");

  const expected = Buffer.from(digest);
  const received = Buffer.from(signatureHeader);

  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
};
