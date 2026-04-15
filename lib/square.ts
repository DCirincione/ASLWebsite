import { createHmac, timingSafeEqual } from "crypto";

const SQUARE_API_VERSION = "2026-01-22";

type SquareError = {
  category?: string;
  code?: string;
  detail?: string;
};

type SquareCustomer = {
  id?: string;
};

type SquarePayment = {
  id?: string;
  status?: string;
  order_id?: string;
};

type SquareCard = {
  id?: string;
  customer_id?: string;
  card_brand?: string;
  last_4?: string;
  exp_month?: number;
  exp_year?: number;
};

type SquareSubscription = {
  id?: string;
  status?: string;
  customer_id?: string;
  plan_variation_id?: string;
};

type SquareCatalogCategoryReference = {
  id?: string;
};

type SquareCatalogItem = {
  id?: string;
  type?: string;
  item_data?: {
    image_ids?: string[];
    categories?: SquareCatalogCategoryReference[];
    reporting_category?: SquareCatalogCategoryReference;
  };
};

type SquareCatalogCategory = {
  id?: string;
  type?: string;
  category_data?: {
    name?: string;
  };
};

type SquareCatalogImage = {
  id?: string;
  type?: string;
  image_data?: {
    url?: string;
  };
};

export type SquareCatalogItemMerchDetails = {
  collections: string[];
  imageUrls: string[];
};

const getSquareApiToken = () => process.env.SQUARE_ACCESS_TOKEN?.trim() || "";
const getSquareEnvironment = () => (process.env.SQUARE_ENVIRONMENT?.trim().toLowerCase() || "production");

const getSquareApiBaseUrl = () =>
  getSquareEnvironment() === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";

export const getSquareLocationId = () => process.env.SQUARE_LOCATION_ID?.trim() || "";
export const getSquarePartnerStandardPlanVariationId = () =>
  process.env.SQUARE_PARTNER_STANDARD_PLAN_VARIATION_ID?.trim() || "";
export const getSquarePartnerStandardPromoCode = () =>
  process.env.PARTNER_APPLICATION_STANDARD_PROMO_CODE?.trim() || "";
export const getSquarePartnerStandardPromoPlanVariationId = () =>
  process.env.SQUARE_PARTNER_STANDARD_PROMO_PLAN_VARIATION_ID?.trim() || "";

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

const squareFetch = async <T>(path: string, body: Record<string, unknown>, fallbackError: string) => {
  const response = await fetch(`${getSquareApiBaseUrl()}${path}`, {
    method: "POST",
    headers: getSquareHeaders(),
    body: JSON.stringify(body),
  });

  const json = (await response.json().catch(() => null)) as ({ errors?: SquareError[] } & T) | null;

  if (!response.ok) {
    throw new Error(getSquareErrorMessage(json?.errors, fallbackError));
  }

  if (!json) {
    throw new Error(fallbackError);
  }

  return json;
};

export const createSquarePaymentLink = async (body: Record<string, unknown>) => {
  return squareFetch<
    | {
        payment_link?: {
          id?: string;
          url?: string;
          order_id?: string;
        };
        related_resources?: {
          orders?: Array<{ id?: string }>;
        };
      }
  >("/v2/online-checkout/payment-links", body, "Could not create the Square checkout link.");
};

export const createSquareCustomer = async (body: Record<string, unknown>) =>
  squareFetch<{ customer?: SquareCustomer }>("/v2/customers", body, "Could not create the Square customer.");

export const createSquareCard = async (body: Record<string, unknown>) =>
  squareFetch<{ card?: SquareCard }>("/v2/cards", body, "Could not save the card on file.");

export const createSquarePayment = async (body: Record<string, unknown>) =>
  squareFetch<{ payment?: SquarePayment }>("/v2/payments", body, "Could not process the Square payment.");

export const createSquareSubscription = async (body: Record<string, unknown>) =>
  squareFetch<{ subscription?: SquareSubscription }>(
    "/v2/subscriptions",
    body,
    "Could not create the Square subscription.",
  );

export const searchSquarePaymentByOrderId = async (orderId: string) => {
  const trimmedOrderId = orderId.trim();
  if (!trimmedOrderId) return null;

  const response = await fetch(`${getSquareApiBaseUrl()}/v2/payments/search`, {
    method: "POST",
    headers: getSquareHeaders(),
    body: JSON.stringify({
      query: {
        filter: {
          order_ids: [trimmedOrderId],
        },
        sort: {
          sort_field: "CREATED_AT",
          sort_order: "DESC",
        },
      },
      limit: 1,
    }),
  });

  const json = (await response.json().catch(() => null)) as
    | {
        errors?: SquareError[];
        payments?: SquarePayment[];
      }
    | null;

  if (!response.ok) {
    throw new Error(getSquareErrorMessage(json?.errors, "Could not load the Square payment status."));
  }

  return json?.payments?.[0] ?? null;
};

export const readSquareCatalogItemMerchDetails = async (itemIds: string[]) => {
  const normalizedItemIds = [...new Set(itemIds.map((id) => id.trim()).filter(Boolean))];
  if (normalizedItemIds.length === 0) {
    return new Map<string, SquareCatalogItemMerchDetails>();
  }

  const itemResponse = await squareFetch<{ objects?: SquareCatalogItem[]; related_objects?: Array<SquareCatalogCategory | SquareCatalogImage> }>(
    "/v2/catalog/batch-retrieve",
    {
      object_ids: normalizedItemIds,
      include_related_objects: true,
    },
    "Could not load Square catalog items.",
  );

  const items = itemResponse.objects ?? [];
  const imageUrlById = new Map(
    (itemResponse.related_objects ?? [])
      .filter((entry): entry is SquareCatalogImage => entry?.type === "IMAGE")
      .map((image) => [image.id?.trim(), image.image_data?.url?.trim()] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[0] && entry[1])),
  );
  const categoryIds = [
    ...new Set(
      items.flatMap((item) => [
        ...(item.item_data?.categories?.map((category) => category.id?.trim()).filter(Boolean) ?? []),
        item.item_data?.reporting_category?.id?.trim() || "",
      ]).filter(Boolean),
    ),
  ];

  if (categoryIds.length === 0) {
    return new Map(
      items
        .map((item) => {
          const imageUrls = (item.item_data?.image_ids ?? [])
            .map((imageId) => imageUrlById.get(imageId?.trim() || ""))
            .filter((url): url is string => Boolean(url));
          const merchDetails: SquareCatalogItemMerchDetails = {
            collections: [],
            imageUrls,
          };

          return [
            item.id?.trim() || "",
            merchDetails,
          ] as const;
        })
        .filter((entry): entry is readonly [string, SquareCatalogItemMerchDetails] => Boolean(entry[0])),
    );
  }

  const categoryResponse = await squareFetch<{ objects?: SquareCatalogCategory[] }>(
    "/v2/catalog/batch-retrieve",
    {
      object_ids: categoryIds,
      include_related_objects: false,
    },
    "Could not load Square catalog categories.",
  );

  const categoryNameById = new Map(
    (categoryResponse.objects ?? [])
      .map((category) => [category.id?.trim(), category.category_data?.name?.trim()] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[0] && entry[1])),
  );

  return new Map(
    items.map((item) => {
      const collectionNames = [
        ...(item.item_data?.categories?.map((category) => category.id?.trim() || "").filter(Boolean) ?? []),
        item.item_data?.reporting_category?.id?.trim() || "",
      ]
        .filter(Boolean)
        .map((categoryId) => categoryNameById.get(categoryId))
        .filter((name): name is string => Boolean(name));
      const imageUrls = (item.item_data?.image_ids ?? [])
        .map((imageId) => imageUrlById.get(imageId?.trim() || ""))
        .filter((url): url is string => Boolean(url));

      return [
        item.id?.trim() || "",
        {
          collections: [...new Set(collectionNames)],
          imageUrls,
        },
      ] as const;
    }).filter((entry): entry is readonly [string, SquareCatalogItemMerchDetails] => Boolean(entry[0])),
  );
};

export const readSquareCatalogItemCollections = async (itemIds: string[]) => {
  const details = await readSquareCatalogItemMerchDetails(itemIds);
  return new Map(
    [...details.entries()].map(([itemId, entry]) => [itemId, entry.collections] as const),
  );
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
