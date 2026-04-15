type PrintfulPaging = {
  total?: number;
  offset?: number;
  limit?: number;
};

type PrintfulApiResponse<T> = {
  code?: number;
  result: T;
  paging?: PrintfulPaging;
  error?: {
    reason?: string;
    message?: string;
  };
};

type PrintfulStoreSummary = {
  id?: number | string;
  name?: string;
  type?: string;
};

type PrintfulSyncProductSummary = {
  id?: number | string;
  external_id?: string | null;
  name?: string;
  variants?: number;
  synced?: number;
  thumbnail_url?: string | null;
  is_ignored?: boolean;
};

type PrintfulSyncVariantFile = {
  type?: string | null;
  url?: string | null;
  preview_url?: string | null;
  thumbnail_url?: string | null;
  visible?: boolean;
};

type PrintfulSyncVariant = {
  id?: number | string;
  external_id?: string | null;
  name?: string;
  retail_price?: number | string | null;
  product?: {
    image?: string | null;
    name?: string | null;
    variant_id?: number | null;
    product_id?: number | null;
  };
  files?: PrintfulSyncVariantFile[];
  main_category_id?: number | null;
  size?: string | null;
  color?: string | null;
  availability_status?: string | null;
  is_ignored?: boolean;
  synced?: boolean;
};

type PrintfulSyncProductDetails = {
  sync_product?: PrintfulSyncProductSummary;
  sync_variants?: PrintfulSyncVariant[];
};

type PrintfulProductPathMode = "store" | "sync";

export type MerchFilterOption = {
  id: string;
  label: string;
  count: number;
};

export type MerchProduct = {
  id: string;
  name: string;
  description: string;
  category: string;
  categoryKey: string;
  collections: string[];
  collectionKeys: string[];
  sport: string | null;
  sportKey: string | null;
  sizes: string[];
  colors: string[];
  priceMin: number | null;
  priceMax: number | null;
  priceLabel: string;
  imageUrl: string | null;
  ctaUrl: string | null;
  ctaLabel: string;
  availability: string;
  featured: boolean;
};

export type MerchCatalog = {
  source: "printful" | "fallback";
  storeName: string | null;
  storefrontUrl: string | null;
  statusMessage: string | null;
  products: MerchProduct[];
  filters: {
    categories: MerchFilterOption[];
    collections: MerchFilterOption[];
    sports: MerchFilterOption[];
    sizes: MerchFilterOption[];
    colors: MerchFilterOption[];
  };
};

class PrintfulRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PrintfulRequestError";
    this.status = status;
  }
}

const PRINTFUL_API_BASE_URL = "https://api.printful.com";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const categoryMatchers = [
  { label: "T-Shirts", keywords: ["jersey", "shirt", "t-shirt", "tee"] },
  { label: "Hoodies", keywords: ["hoodie", "hooded"] },
  { label: "Sweatshirts", keywords: ["crewneck", "sweatshirt"] },
  { label: "Outerwear", keywords: ["jacket", "quarter zip", "windbreaker", "zip hoodie", "zip-up"] },
  { label: "Bottoms", keywords: ["jogger", "leggings", "pants", "shorts", "sweatpants"] },
  { label: "Hats", keywords: ["beanie", "cap", "hat", "snapback", "visor"] },
  { label: "Accessories", keywords: ["bag", "bottle", "duffel", "sock", "socks", "towel"] },
] as const;

const sportMatchers = [
  { label: "Soccer", keywords: ["futbol", "soccer"] },
  { label: "Basketball", keywords: ["basketball", "hoops"] },
  { label: "Baseball", keywords: ["baseball", "softball"] },
  { label: "Flag Football", keywords: ["flag football", "football"] },
  { label: "Golf", keywords: ["golf"] },
  { label: "Pickleball", keywords: ["pickleball"] },
  { label: "Run Club", keywords: ["run club", "running"] },
] as const;

const categorySortOrder = [
  "T-Shirts",
  "Hoodies",
  "Sweatshirts",
  "Outerwear",
  "Bottoms",
  "Hats",
  "Accessories",
  "Merch",
] as const;

const sizeSortOrder = [
  "Youth XS",
  "Youth S",
  "Youth M",
  "Youth L",
  "Youth XL",
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
  "6XL",
] as const;

const getPrintfulApiToken = () => process.env.PRINTFUL_API_TOKEN?.trim() || "";
const getPrintfulStoreId = () => process.env.PRINTFUL_STORE_ID?.trim() || "";
const getPrintfulProductSource = (): PrintfulProductPathMode | "" => {
  const value = process.env.PRINTFUL_PRODUCT_SOURCE?.trim().toLowerCase();
  if (value === "store" || value === "sync") return value;
  return "";
};

export const getPrintfulStorefrontUrl = () => (process.env.PRINTFUL_STOREFRONT_URL?.trim() || "").replace(/\/+$/, "");

const slugifyValue = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const parsePrice = (value: number | string | null | undefined) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

function formatPriceRange(min: number | null, max: number | null) {
  if (min == null && max == null) return "Price varies";
  if (min != null && max != null && Math.abs(min - max) < 0.001) {
    return currencyFormatter.format(min);
  }
  if (min != null && max != null) {
    return `From ${currencyFormatter.format(min)}`;
  }
  return currencyFormatter.format(min ?? max ?? 0);
}

const dedupeStrings = (values: Array<string | null | undefined>) =>
  [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];

const sortSizes = (sizes: string[]) =>
  [...sizes].sort((left, right) => {
    const leftIndex = sizeSortOrder.indexOf(left as (typeof sizeSortOrder)[number]);
    const rightIndex = sizeSortOrder.indexOf(right as (typeof sizeSortOrder)[number]);

    if (leftIndex >= 0 || rightIndex >= 0) {
      if (leftIndex < 0) return 1;
      if (rightIndex < 0) return -1;
      return leftIndex - rightIndex;
    }

    return left.localeCompare(right);
  });

const sortCategories = (categories: string[]) =>
  [...categories].sort((left, right) => {
    const leftIndex = categorySortOrder.indexOf(left as (typeof categorySortOrder)[number]);
    const rightIndex = categorySortOrder.indexOf(right as (typeof categorySortOrder)[number]);

    if (leftIndex >= 0 || rightIndex >= 0) {
      if (leftIndex < 0) return 1;
      if (rightIndex < 0) return -1;
      return leftIndex - rightIndex;
    }

    return left.localeCompare(right);
  });

const resolvePrintfulHeaders = (storeId?: string) => {
  const token = getPrintfulApiToken();

  if (!token) {
    throw new Error("PRINTFUL_API_TOKEN is not configured.");
  }

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(storeId ? { "X-PF-Store-Id": storeId } : {}),
  };
};

const readPrintfulErrorMessage = (json: unknown, fallback: string) => {
  if (!json || typeof json !== "object") return fallback;

  const reason =
    "error" in json && json.error && typeof json.error === "object" && "reason" in json.error
      ? json.error.reason
      : undefined;
  const message =
    "error" in json && json.error && typeof json.error === "object" && "message" in json.error
      ? json.error.message
      : undefined;

  return (typeof message === "string" && message.trim()) || (typeof reason === "string" && reason.trim()) || fallback;
};

async function fetchPrintfulJson<T>(path: string, storeId?: string) {
  const response = await fetch(`${PRINTFUL_API_BASE_URL}${path}`, {
    headers: resolvePrintfulHeaders(storeId),
    cache: "no-store",
  });

  const json = (await response.json().catch(() => null)) as PrintfulApiResponse<T> | null;

  if (!response.ok || !json) {
    throw new PrintfulRequestError(
      readPrintfulErrorMessage(json, `Printful request failed for ${path}.`),
      response.status || 500,
    );
  }

  return json;
}

async function resolvePrintfulStoreContext() {
  const explicitStoreId = getPrintfulStoreId();
  if (explicitStoreId) {
    return {
      storeId: explicitStoreId,
      storeName: null,
    };
  }

  try {
    const response = await fetchPrintfulJson<PrintfulStoreSummary[]>("/stores");
    const firstStore = response.result?.[0];

    return {
      storeId: firstStore?.id != null ? String(firstStore.id) : "",
      storeName: firstStore?.name?.trim() || null,
    };
  } catch {
    return {
      storeId: "",
      storeName: null,
    };
  }
}

const getConfiguredProductModes = (): PrintfulProductPathMode[] => {
  const configured = getPrintfulProductSource();
  if (configured) return [configured];
  return ["store", "sync"];
};

async function fetchPrintfulProductList(pathMode: PrintfulProductPathMode, storeId?: string) {
  const collected: PrintfulSyncProductSummary[] = [];
  let offset = 0;

  while (true) {
    const response = await fetchPrintfulJson<PrintfulSyncProductSummary[]>(
      `/${pathMode}/products?status=synced&limit=100&offset=${offset}`,
      storeId,
    );

    collected.push(...(response.result ?? []));

    const total = response.paging?.total ?? collected.length;
    const limit = response.paging?.limit ?? response.result?.length ?? 0;

    if (!limit || collected.length >= total) {
      break;
    }

    offset += limit;
  }

  return collected;
}

async function fetchPrintfulProductDetails(id: string, pathMode: PrintfulProductPathMode, storeId?: string) {
  const response = await fetchPrintfulJson<PrintfulSyncProductDetails>(`/${pathMode}/products/${id}`, storeId);
  return response.result;
}

const inferCategory = (name: string) => {
  const normalized = name.toLowerCase();

  for (const matcher of categoryMatchers) {
    if (matcher.keywords.some((keyword) => normalized.includes(keyword))) {
      return matcher.label;
    }
  }

  return "Merch";
};

const inferSport = (name: string) => {
  const normalized = name.toLowerCase();

  for (const matcher of sportMatchers) {
    if (matcher.keywords.some((keyword) => normalized.includes(keyword))) {
      return matcher.label;
    }
  }

  return null;
};

const resolveProductImage = (
  product: PrintfulSyncProductSummary | undefined,
  variants: PrintfulSyncVariant[],
) => {
  const previewFile = variants
    .flatMap((variant) => variant.files ?? [])
    .find((file) => file.type === "preview" && isHttpUrl(file.preview_url || file.thumbnail_url || file.url));

  if (previewFile) {
    return previewFile.preview_url || previewFile.thumbnail_url || previewFile.url || null;
  }

  if (isHttpUrl(product?.thumbnail_url)) {
    return product?.thumbnail_url || null;
  }

  const variantWithProductImage = variants.find((variant) => isHttpUrl(variant.product?.image));
  if (variantWithProductImage?.product?.image) {
    return variantWithProductImage.product.image;
  }

  const variantWithImage = variants.find((variant) =>
    variant.files?.some((file) => isHttpUrl(file.preview_url || file.thumbnail_url || file.url)),
  );

  const file = variantWithImage?.files?.find((entry) => isHttpUrl(entry.preview_url || entry.thumbnail_url || entry.url));
  return file?.preview_url || file?.thumbnail_url || file?.url || product?.thumbnail_url || null;
};

const isHttpUrl = (value: string | null | undefined) => {
  if (!value) return false;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const resolveProductLink = (externalId: string | null | undefined, storefrontUrl: string | null) => {
  if (isHttpUrl(externalId)) {
    return externalId?.trim() || null;
  }

  return storefrontUrl;
};

const buildDescription = (sizes: string[], colors: string[], category: string) => {
  const sizeText = sizes.length > 0 ? `${sizes.length} size${sizes.length === 1 ? "" : "s"}` : "limited sizing";
  const colorText = colors.length > 0 ? `${colors.length} color${colors.length === 1 ? "" : "s"}` : "single color";

  return `${category} option with ${sizeText} and ${colorText}.`;
};

const mapPrintfulProduct = (
  details: PrintfulSyncProductDetails,
  fallbackId: string,
  storefrontUrl: string | null,
  collections: string[],
  index: number,
): MerchProduct | null => {
  const syncProduct = details.sync_product;
  const name = syncProduct?.name?.trim();
  const variants = (details.sync_variants ?? []).filter((variant) => !variant.is_ignored);

  if (!name || variants.length === 0) {
    return null;
  }

  const sizes = sortSizes(dedupeStrings(variants.map((variant) => variant.size)));
  const colors = dedupeStrings(variants.map((variant) => variant.color)).sort((left, right) => left.localeCompare(right));
  const prices = variants
    .filter((variant) => (variant.availability_status || "").toLowerCase() !== "discontinued")
    .map((variant) => parsePrice(variant.retail_price))
    .filter((value) => value != null) as number[];
  const priceMin = prices.length > 0 ? Math.min(...prices) : null;
  const priceMax = prices.length > 0 ? Math.max(...prices) : null;
  const category = inferCategory(name);
  const sport = inferSport(name);
  const externalId = syncProduct?.external_id?.trim() || null;
  const ctaUrl = resolveProductLink(externalId, storefrontUrl);

  return {
    id: syncProduct?.id != null ? String(syncProduct.id) : fallbackId,
    name,
    description: buildDescription(sizes, colors, category),
    category,
    categoryKey: slugifyValue(category),
    collections,
    collectionKeys: collections.map((collection) => slugifyValue(collection)),
    sport,
    sportKey: sport ? slugifyValue(sport) : null,
    sizes,
    colors,
    priceMin,
    priceMax,
    priceLabel: formatPriceRange(priceMin, priceMax),
    imageUrl: resolveProductImage(syncProduct, variants),
    ctaUrl,
    ctaLabel: ctaUrl ? (isHttpUrl(externalId) ? "View Product" : "Open Store") : "Coming Soon",
    availability: variants.some((variant) => (variant.availability_status || "").toLowerCase() === "out_of_stock")
      ? "out_of_stock"
      : "active",
    featured: index < 3,
  };
};

const buildFilterOptions = (products: MerchProduct[]): MerchCatalog["filters"] => {
  const categories = new Map<string, MerchFilterOption>();
  const collections = new Map<string, MerchFilterOption>();
  const sports = new Map<string, MerchFilterOption>();
  const sizes = new Map<string, MerchFilterOption>();
  const colors = new Map<string, MerchFilterOption>();

  for (const product of products) {
    categories.set(product.categoryKey, {
      id: product.categoryKey,
      label: product.category,
      count: (categories.get(product.categoryKey)?.count ?? 0) + 1,
    });

    for (const collection of product.collections) {
      const collectionId = slugifyValue(collection);
      collections.set(collectionId, {
        id: collectionId,
        label: collection,
        count: (collections.get(collectionId)?.count ?? 0) + 1,
      });
    }

    if (product.sport && product.sportKey) {
      sports.set(product.sportKey, {
        id: product.sportKey,
        label: product.sport,
        count: (sports.get(product.sportKey)?.count ?? 0) + 1,
      });
    }

    for (const size of product.sizes) {
      const sizeId = slugifyValue(size);
      sizes.set(sizeId, {
        id: sizeId,
        label: size,
        count: (sizes.get(sizeId)?.count ?? 0) + 1,
      });
    }

    for (const color of product.colors) {
      const colorId = slugifyValue(color);
      colors.set(colorId, {
        id: colorId,
        label: color,
        count: (colors.get(colorId)?.count ?? 0) + 1,
      });
    }
  }

  return {
    categories: sortCategories([...categories.values()].map((option) => option.label))
      .map((label) => [...categories.values()].find((option) => option.label === label))
      .filter(Boolean) as MerchFilterOption[],
    collections: [...collections.values()].sort((left, right) => left.label.localeCompare(right.label)),
    sports: [...sports.values()].sort((left, right) => left.label.localeCompare(right.label)),
    sizes: sortSizes([...sizes.values()].map((option) => option.label))
      .map((label) => [...sizes.values()].find((option) => option.label === label))
      .filter(Boolean) as MerchFilterOption[],
    colors: [...colors.values()].sort((left, right) => left.label.localeCompare(right.label)),
  };
};

const buildFallbackCatalog = (statusMessage: string | null): MerchCatalog => {
  const storefrontUrl = getPrintfulStorefrontUrl() || null;
  const products: MerchProduct[] = [];

  return {
    source: "fallback",
    storeName: null,
    storefrontUrl,
    statusMessage,
    products,
    filters: buildFilterOptions(products),
  };
};

export async function readMerchCatalog(): Promise<MerchCatalog> {
  const token = getPrintfulApiToken();

  if (!token) {
    return buildFallbackCatalog(
      "Preview mode is active. Add PRINTFUL_API_TOKEN to load live products and filter options from Printful.",
    );
  }

  const storefrontUrl = getPrintfulStorefrontUrl() || null;
  const { storeId, storeName } = await resolvePrintfulStoreContext();
  const productModes = getConfiguredProductModes();

  try {
    let activeMode: PrintfulProductPathMode | null = null;
    let summaries: PrintfulSyncProductSummary[] = [];

    for (const mode of productModes) {
      try {
        summaries = await fetchPrintfulProductList(mode, storeId || undefined);
        activeMode = mode;
        break;
      } catch (error) {
        if (!(error instanceof PrintfulRequestError)) {
          throw error;
        }
      }
    }

    if (!activeMode) {
      return buildFallbackCatalog(
        "Printful is configured, but the catalog endpoint could not be reached. Check PRINTFUL_STORE_ID or PRINTFUL_PRODUCT_SOURCE.",
      );
    }

    const squareCollectionsByItemId = await readSquareCatalogItemCollections(
      dedupeStrings(summaries.map((summary) => summary.external_id)),
    ).catch(() => new Map<string, string[]>());

    const detailResults = await Promise.allSettled(
      summaries
        .filter((summary) => summary.id != null && !summary.is_ignored)
        .map((summary, index) =>
          fetchPrintfulProductDetails(String(summary.id), activeMode, storeId || undefined).then((details) =>
            mapPrintfulProduct(
              details,
              `printful-${index}`,
              storefrontUrl,
              squareCollectionsByItemId.get(details.sync_product?.external_id?.trim() || "") ?? [],
              index,
            ),
          ),
        ),
    );

    const products = detailResults
      .flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : []))
      .sort((left, right) => {
        if (left.featured !== right.featured) {
          return left.featured ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
      });

    if (products.length === 0) {
      return buildFallbackCatalog(
        "Printful is connected, but no synced products were found yet. Add products in Printful and they will appear here.",
      );
    }

    return {
      source: "printful",
      storeName,
      storefrontUrl,
      statusMessage: detailResults.some((result) => result.status === "rejected")
        ? "Some Printful items could not be loaded, so the storefront is showing the products that were available."
        : null,
      products,
      filters: buildFilterOptions(products),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Printful products.";
    return buildFallbackCatalog(message);
  }
}
import { readSquareCatalogItemCollections } from "./square";
