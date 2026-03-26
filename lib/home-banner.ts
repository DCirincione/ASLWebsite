export type HomeBannerButtonTarget = "none" | "event" | "page";

export const DEFAULT_HOME_BANNER_TEXT = "ALDRICH SUNDAY LEAGUE SIGN-UPS OPEN";

export const HOME_BANNER_PAGE_OPTIONS = [
  { href: "/events", label: "Events" },
  { href: "/sports", label: "Sports" },
  { href: "/community", label: "Community" },
  { href: "/contact", label: "Contact" },
  { href: "/leagues", label: "Leagues" },
  { href: "/leagues/sunday-league", label: "Sunday League" },
  { href: "/sponsors", label: "Sponsors" },
  { href: "/register", label: "Register" },
] as const;

export const isHomeBannerButtonTarget = (value: unknown): value is HomeBannerButtonTarget =>
  value === "none" || value === "event" || value === "page";

export const isHomeBannerPageHref = (value?: string | null) =>
  HOME_BANNER_PAGE_OPTIONS.some((option) => option.href === (value?.trim() || ""));

export const resolveHomeBannerButtonHref = ({
  buttonTarget,
  buttonEventId,
  buttonPageHref,
}: {
  buttonTarget?: HomeBannerButtonTarget;
  buttonEventId?: string;
  buttonPageHref?: string;
}) => {
  if (buttonTarget === "event") {
    const eventId = buttonEventId?.trim() || "";
    return eventId ? `/events?eventId=${encodeURIComponent(eventId)}` : "";
  }

  if (buttonTarget === "page") {
    return buttonPageHref?.trim() || "";
  }

  return "";
};
