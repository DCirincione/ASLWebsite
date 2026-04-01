import { NextRequest, NextResponse } from "next/server";

import { isAdminOrOwner } from "@/lib/admin-route-auth";
import { readSundayLeagueSettings, writeSundayLeagueSettings } from "@/lib/sunday-league-settings";

export async function GET() {
  try {
    const settings = await readSundayLeagueSettings();
    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json({ error: "Could not load Sunday League settings." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const allowed = await isAdminOrOwner(req);
    if (!allowed) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }

    const body = (await req.json()) as {
      depositAmountCents?: number;
    };

    const depositAmountCents = Math.round(Number(body.depositAmountCents));
    if (!Number.isFinite(depositAmountCents) || depositAmountCents <= 0) {
      return NextResponse.json({ error: "Deposit amount must be greater than zero." }, { status: 400 });
    }

    const settings = await writeSundayLeagueSettings({ depositAmountCents });
    return NextResponse.json({ ok: true, settings });
  } catch {
    return NextResponse.json({ error: "Could not update Sunday League settings." }, { status: 500 });
  }
}
