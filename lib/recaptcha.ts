export const RECAPTCHA_CONTACT_ACTION = "contact_form";

const DEFAULT_RECAPTCHA_MIN_SCORE = 0.5;

export const RECAPTCHA_SITE_KEY_ENV_NAMES = [
  "NEXT_PUBLIC_RECAPTCHA_SITE_KEY",
  "NEXT_PUBLIC_GOOGLE_RECAPTCHA_SITE_KEY",
] as const;

export const RECAPTCHA_SECRET_KEY_ENV_NAMES = [
  "RECAPTCHA_SECRET_KEY",
  "GOOGLE_RECAPTCHA_SECRET_KEY",
] as const;

export const getRecaptchaSiteKey = () =>
  process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_GOOGLE_RECAPTCHA_SITE_KEY?.trim() ||
  "";

export const getRecaptchaSecretKey = () =>
  process.env.RECAPTCHA_SECRET_KEY?.trim() ||
  process.env.GOOGLE_RECAPTCHA_SECRET_KEY?.trim() ||
  "";

export const getRecaptchaMinScore = () => {
  const value = Number(process.env.RECAPTCHA_MIN_SCORE ?? "");
  if (Number.isFinite(value) && value >= 0 && value <= 1) {
    return value;
  }
  return DEFAULT_RECAPTCHA_MIN_SCORE;
};
