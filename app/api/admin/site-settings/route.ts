import { NextRequest, NextResponse } from "next/server";

import { isAdminOrOwner } from "@/lib/admin-route-auth";
import { isHomeBannerButtonTarget, isHomeBannerPageHref } from "@/lib/home-banner";
import { readSiteSettings, writeSiteSettings } from "@/lib/site-settings";

export async function GET() {
  try {
    const settings = await readSiteSettings();
    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json({ error: "Could not load site settings." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const allowed = await isAdminOrOwner(req);
    if (!allowed) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }

    const body = (await req.json()) as {
      homeBanner?: {
        enabled?: boolean;
        text?: string;
        buttonTarget?: string;
        buttonEventId?: string;
        buttonPageHref?: string;
      };
      merch?: {
        purchasesEnabled?: boolean;
      };
      homeEvents?: {
        selectedEventIds?: unknown;
      };
      sportSponsors?: Record<
        string,
        {
          enabled?: boolean;
          sponsorName?: string;
          imageUrl?: string;
          linkUrl?: string;
          buttonText?: string;
          altText?: string;
        }
      >;
    };

    const currentSettings = await readSiteSettings();
    const enabled =
      typeof body.homeBanner?.enabled === "boolean"
        ? body.homeBanner.enabled
        : currentSettings.homeBanner.enabled;
    const text =
      typeof body.homeBanner?.text === "string"
        ? body.homeBanner.text.trim()
        : currentSettings.homeBanner.text;
    const buttonTarget =
      body.homeBanner == null
        ? currentSettings.homeBanner.buttonTarget
        : isHomeBannerButtonTarget(body.homeBanner.buttonTarget)
          ? body.homeBanner.buttonTarget
          : "none";
    const buttonEventId =
      typeof body.homeBanner?.buttonEventId === "string"
        ? body.homeBanner.buttonEventId.trim()
        : currentSettings.homeBanner.buttonEventId;
    const rawButtonPageHref =
      typeof body.homeBanner?.buttonPageHref === "string"
        ? body.homeBanner.buttonPageHref.trim()
        : currentSettings.homeBanner.buttonPageHref;
    const buttonPageHref = isHomeBannerPageHref(rawButtonPageHref) ? rawButtonPageHref : "";
    const purchasesEnabled =
      typeof body.merch?.purchasesEnabled === "boolean"
        ? body.merch.purchasesEnabled
        : currentSettings.merch.purchasesEnabled;
    const selectedEventIds = Array.isArray(body.homeEvents?.selectedEventIds)
      ? Array.from(
          new Set(
            body.homeEvents.selectedEventIds
              .filter((eventId): eventId is string => typeof eventId === "string")
              .map((eventId) => eventId.trim())
              .filter(Boolean),
          ),
        )
      : currentSettings.homeEvents.selectedEventIds;
    const sportSponsors = body.sportSponsors
      ? Object.fromEntries(
          Object.entries(body.sportSponsors)
            .map(([rawSlug, settings]) => {
              const slug = rawSlug.trim().toLowerCase();
              if (!slug) return null;
              return [
                slug,
                {
                  enabled: Boolean(settings?.enabled),
                  sponsorName: typeof settings?.sponsorName === "string" ? settings.sponsorName.trim() : "",
                  imageUrl: typeof settings?.imageUrl === "string" ? settings.imageUrl.trim() : "",
                  linkUrl: typeof settings?.linkUrl === "string" ? settings.linkUrl.trim() : "",
                  buttonText: typeof settings?.buttonText === "string" ? settings.buttonText.trim() : "Take Me There",
                  altText: typeof settings?.altText === "string" ? settings.altText.trim() : "",
                },
              ] as const;
            })
            .filter((entry): entry is readonly [string, NonNullable<(typeof currentSettings.sportSponsors)[string]>] =>
              Boolean(entry),
            ),
        )
      : currentSettings.sportSponsors;

    if (enabled && !text) {
      return NextResponse.json({ error: "Banner text is required when the banner is enabled." }, { status: 400 });
    }
    if (buttonTarget === "event" && !buttonEventId) {
      return NextResponse.json({ error: "Choose an event for the banner button." }, { status: 400 });
    }
    if (buttonTarget === "page" && !buttonPageHref) {
      return NextResponse.json({ error: "Choose a page for the banner button." }, { status: 400 });
    }
    if (body.homeEvents && selectedEventIds.length !== 4) {
      return NextResponse.json({ error: "Choose exactly 4 events for the home page." }, { status: 400 });
    }

    const settings = await writeSiteSettings({
      homeBanner: {
        enabled,
        text,
        buttonTarget,
        buttonEventId: buttonTarget === "event" ? buttonEventId : "",
        buttonPageHref: buttonTarget === "page" ? buttonPageHref : "",
      },
      homeEvents: {
        selectedEventIds: selectedEventIds.slice(0, 4),
      },
      merch: {
        purchasesEnabled,
      },
      sportSponsors,
    });

    return NextResponse.json({ ok: true, settings });
  } catch {
    return NextResponse.json({ error: "Could not update site settings." }, { status: 500 });
  }
}
