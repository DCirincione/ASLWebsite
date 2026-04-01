export type SundayLeagueSettings = {
  depositAmountCents: number;
};

export const DEFAULT_SUNDAY_LEAGUE_DEPOSIT_AMOUNT_CENTS = 10000;
export const SUNDAY_LEAGUE_DEPOSIT_CURRENCY = "USD";

export const formatSundayLeagueDepositAmount = (amountCents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: SUNDAY_LEAGUE_DEPOSIT_CURRENCY,
  }).format(amountCents / 100);
