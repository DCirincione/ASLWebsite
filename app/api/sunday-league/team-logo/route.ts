import { NextRequest, NextResponse } from "next/server";

import { getSupabaseServiceRole } from "@/lib/admin-route-auth";

const SIGNUPS_BUCKET = "signups";
const SUNDAY_LEAGUE_PREFIX = "sunday-league/";
const SIGNED_URL_LIFETIME_SECONDS = 60 * 60;

const isAllowedLogoPath = (path: string) =>
  path.startsWith(SUNDAY_LEAGUE_PREFIX) &&
  !path.includes("..") &&
  !path.includes("\\") &&
  !path.includes("\0");

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path")?.trim() ?? "";
  if (!isAllowedLogoPath(path)) {
    return NextResponse.json({ error: "Invalid team logo path." }, { status: 400 });
  }

  const supabase = getSupabaseServiceRole();
  if (!supabase) {
    return NextResponse.json({ error: "Team logo storage is not configured." }, { status: 503 });
  }

  const { data, error } = await supabase.storage
    .from(SIGNUPS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_LIFETIME_SECONDS);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Team logo was not found." }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
