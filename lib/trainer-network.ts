export const TRAINER_TERMS_VERSION = "2026-10-12";
export const TRAINER_WAIVER_VERSION = "2026-10-12";
export const textValue = (v: unknown, max = 2000) => typeof v === "string" ? v.trim().slice(0, max) : "";
export const stringList = (v: unknown) => Array.isArray(v) ? [...new Set(v.map(x => textValue(x, 120)).filter(Boolean))].slice(0, 30) : [];
export const safeBookingUrl = (v: unknown) => {
  try { const u = new URL(textValue(v)); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch { return null; }
};
export const priceInCents = (option: Record<string, unknown>) => {
  if (typeof option.priceCents === "number" && Number.isSafeInteger(option.priceCents) && option.priceCents > 0) return option.priceCents;
  const value = textValue(option.price).replace(/[$,]/g, "");
  return /^\d+(\.\d{1,2})?$/.test(value) ? Math.round(Number(value) * 100) : 0;
};
