export const EVENT_CHECKOUT_WINDOW_MS = 30 * 60 * 1000;
export const EVENT_PAYMENT_CURRENCY = "USD";

export const formatEventPaymentAmount = (amountCents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: EVENT_PAYMENT_CURRENCY,
  }).format(amountCents / 100);
