import { NextRequest, NextResponse } from "next/server";

import { isAdminOrOwner } from "@/lib/admin-route-auth";
import {
  SUNDAY_LEAGUE_REQUIRED_SIGNUP_FIELD_NAMES,
  normalizeSundayLeagueSignupForm,
  type SundayLeagueSignupForm,
} from "@/lib/sunday-league-signup-form";
import { readSundayLeagueSignupForm, writeSundayLeagueSignupForm } from "@/lib/sunday-league-signup-form-store";

export async function GET() {
  try {
    const form = await readSundayLeagueSignupForm();
    return NextResponse.json({ form });
  } catch {
    return NextResponse.json({ error: "Could not load the Sunday League signup form." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const allowed = await isAdminOrOwner(req);
    if (!allowed) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }

    const body = (await req.json()) as { form?: Partial<SundayLeagueSignupForm> };
    const form = normalizeSundayLeagueSignupForm(body.form);
    const missingRequiredFields = SUNDAY_LEAGUE_REQUIRED_SIGNUP_FIELD_NAMES.filter(
      (name) => !form.fields.some((field) => field.name === name),
    );

    if (missingRequiredFields.length > 0) {
      return NextResponse.json(
        {
          error: "Captain name, captain phone, captain email, and team name must stay on the signup form.",
        },
        { status: 400 },
      );
    }

    const saved = await writeSundayLeagueSignupForm(form);
    return NextResponse.json({ ok: true, form: saved });
  } catch {
    return NextResponse.json({ error: "Could not update the Sunday League signup form." }, { status: 500 });
  }
}
