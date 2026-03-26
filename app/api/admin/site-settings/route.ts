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
    };

    const enabled = Boolean(body.homeBanner?.enabled);
    const text = typeof body.homeBanner?.text === "string" ? body.homeBanner.text.trim() : "";
    const buttonTarget = isHomeBannerButtonTarget(body.homeBanner?.buttonTarget) ? body.homeBanner.buttonTarget : "none";
    const buttonEventId = typeof body.homeBanner?.buttonEventId === "string" ? body.homeBanner.buttonEventId.trim() : "";
    const rawButtonPageHref = typeof body.homeBanner?.buttonPageHref === "string" ? body.homeBanner.buttonPageHref.trim() : "";
    const buttonPageHref = isHomeBannerPageHref(rawButtonPageHref) ? rawButtonPageHref : "";

    if (enabled && !text) {
      return NextResponse.json({ error: "Banner text is required when the banner is enabled." }, { status: 400 });
    }
    if (buttonTarget === "event" && !buttonEventId) {
      return NextResponse.json({ error: "Choose an event for the banner button." }, { status: 400 });
    }
    if (buttonTarget === "page" && !buttonPageHref) {
      return NextResponse.json({ error: "Choose a page for the banner button." }, { status: 400 });
    }

    const settings = await writeSiteSettings({
      homeBanner: {
        enabled,
        text,
        buttonTarget,
        buttonEventId: buttonTarget === "event" ? buttonEventId : "",
        buttonPageHref: buttonTarget === "page" ? buttonPageHref : "",
      },
    });

    return NextResponse.json({ ok: true, settings });
  } catch {
    return NextResponse.json({ error: "Could not update site settings." }, { status: 500 });
  }
}
