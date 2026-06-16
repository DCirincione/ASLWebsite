import "server-only";

import { promises as fs } from "fs";
import path from "path";

import { getSupabaseServiceRole } from "@/lib/admin-route-auth";
import {
  DEFAULT_HOME_BANNER_TEXT,
  isHomeBannerButtonTarget,
  isHomeBannerPageHref,
  type HomeBannerButtonTarget,
} from "@/lib/home-banner";

export type HomeBannerSettings = {
  enabled: boolean;
  text: string;
  buttonTarget: HomeBannerButtonTarget;
  buttonEventId: string;
  buttonPageHref: string;
};

export type MerchSettings = {
  purchasesEnabled: boolean;
};

export type SportSponsorSettings = {
  enabled: boolean;
  sponsorName: string;
  imageUrl: string;
  linkUrl: string;
  buttonText: string;
  altText: string;
};

export type SiteSettings = {
  homeBanner: HomeBannerSettings;
  merch: MerchSettings;
  sportSponsors: Record<string, SportSponsorSettings>;
};

const SITE_SETTINGS_KEY = "site_settings";

const DEFAULT_SITE_SETTINGS: SiteSettings = {
  homeBanner: {
    enabled: true,
    text: DEFAULT_HOME_BANNER_TEXT,
    buttonTarget: "none",
    buttonEventId: "",
    buttonPageHref: "",
  },
  merch: {
    purchasesEnabled: true,
  },
  sportSponsors: {},
};

const siteSettingsFilePath = path.join(process.cwd(), "data", "site-settings.json");

const normalizeSiteSettings = (value?: Partial<SiteSettings> | null): SiteSettings => {
  const legacyButtonHref =
    value?.homeBanner &&
    "buttonHref" in value.homeBanner &&
    typeof (value.homeBanner as { buttonHref?: unknown }).buttonHref === "string"
      ? ((value.homeBanner as { buttonHref?: string }).buttonHref ?? "").trim()
      : "";
  const requestedButtonTarget = value?.homeBanner?.buttonTarget;
  const buttonTarget = isHomeBannerButtonTarget(requestedButtonTarget)
    ? requestedButtonTarget
    : legacyButtonHref
      ? "page"
      : DEFAULT_SITE_SETTINGS.homeBanner.buttonTarget;
  const buttonEventId =
    typeof value?.homeBanner?.buttonEventId === "string"
      ? value.homeBanner.buttonEventId.trim()
      : DEFAULT_SITE_SETTINGS.homeBanner.buttonEventId;
  const requestedButtonPageHref =
    typeof value?.homeBanner?.buttonPageHref === "string"
      ? value.homeBanner.buttonPageHref.trim()
      : legacyButtonHref;
  const buttonPageHref = isHomeBannerPageHref(requestedButtonPageHref)
    ? requestedButtonPageHref
    : DEFAULT_SITE_SETTINGS.homeBanner.buttonPageHref;

  const sportSponsors: Record<string, SportSponsorSettings> = {};
  if (value?.sportSponsors && typeof value.sportSponsors === "object" && !Array.isArray(value.sportSponsors)) {
    for (const [rawSlug, rawSettings] of Object.entries(value.sportSponsors)) {
      const slug = rawSlug.trim().toLowerCase();
      if (!slug || !rawSettings || typeof rawSettings !== "object" || Array.isArray(rawSettings)) continue;
      sportSponsors[slug] = {
        enabled: typeof rawSettings.enabled === "boolean" ? rawSettings.enabled : false,
        sponsorName: typeof rawSettings.sponsorName === "string" ? rawSettings.sponsorName.trim() : "",
        imageUrl: typeof rawSettings.imageUrl === "string" ? rawSettings.imageUrl.trim() : "",
        linkUrl: typeof rawSettings.linkUrl === "string" ? rawSettings.linkUrl.trim() : "",
        buttonText: typeof rawSettings.buttonText === "string" ? rawSettings.buttonText.trim() : "Take Me There",
        altText: typeof rawSettings.altText === "string" ? rawSettings.altText.trim() : "",
      };
    }
  }

  return {
    homeBanner: {
      enabled:
        typeof value?.homeBanner?.enabled === "boolean"
          ? value.homeBanner.enabled
          : DEFAULT_SITE_SETTINGS.homeBanner.enabled,
      text:
        typeof value?.homeBanner?.text === "string"
          ? value.homeBanner.text.trim()
          : DEFAULT_SITE_SETTINGS.homeBanner.text,
      buttonTarget,
      buttonEventId: buttonTarget === "event" ? buttonEventId : "",
      buttonPageHref: buttonTarget === "page" ? buttonPageHref : "",
    },
    merch: {
      purchasesEnabled:
        typeof value?.merch?.purchasesEnabled === "boolean"
          ? value.merch.purchasesEnabled
          : DEFAULT_SITE_SETTINGS.merch.purchasesEnabled,
    },
    sportSponsors,
  };
};

const readSiteSettingsFromFile = async (): Promise<SiteSettings> => {
  const raw = await fs.readFile(siteSettingsFilePath, "utf8");
  return normalizeSiteSettings(JSON.parse(raw) as Partial<SiteSettings>);
};

export const readSiteSettings = async (): Promise<SiteSettings> => {
  const supabase = getSupabaseServiceRole();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", SITE_SETTINGS_KEY)
        .maybeSingle();

      if (!error && data?.value && typeof data.value === "object" && !Array.isArray(data.value)) {
        return normalizeSiteSettings(data.value as Partial<SiteSettings>);
      }
    } catch {
      // Fall back to the local file when the database is unavailable.
    }
  }

  try {
    return await readSiteSettingsFromFile();
  } catch {
    return DEFAULT_SITE_SETTINGS;
  }
};

export const writeSiteSettings = async (value: SiteSettings): Promise<SiteSettings> => {
  const next = normalizeSiteSettings(value);

  const supabase = getSupabaseServiceRole();
  if (supabase) {
    const { error } = await supabase.from("app_settings").upsert(
      {
        key: SITE_SETTINGS_KEY,
        value: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );

    if (error) {
      throw error;
    }

    return next;
  }

  await fs.mkdir(path.dirname(siteSettingsFilePath), { recursive: true });
  await fs.writeFile(siteSettingsFilePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
};
