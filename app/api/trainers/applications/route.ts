import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedProfile, getSupabaseServiceRole } from "@/lib/admin-route-auth";
import { safeBookingUrl, stringList, textValue, TRAINER_TERMS_VERSION } from "@/lib/trainer-network";

export async function POST(req: NextRequest) {
  try {
    const viewer = await getAuthenticatedProfile(req);
    if (!viewer) return NextResponse.json({ error: "Please sign in to apply." }, { status: 401 });
    const db = getSupabaseServiceRole();
    if (!db) throw new Error("Service unavailable.");
    const body = await req.json();
    const mode = body.booking_mode === "referral" ? "referral" : "network";
    const sports = stringList(body.sports).filter(s => s !== "Other");
    if (textValue(body.other_sport, 120)) sports.push(textValue(body.other_sport, 120));
    const locations = stringList(body.locations).filter(s => s !== "Other");
    if (textValue(body.other_location, 500)) locations.push(textValue(body.other_location, 500));
    if (body.terms_accepted !== true || !textValue(body.full_name) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(textValue(body.email)) || !textValue(body.phone) || !sports.length || !locations.length || !["Rising", "Collegiate", "Elite"].includes(body.level) || !textValue(body.background) || !textValue(body.availability) || !textValue(body.motivation) || (mode === "referral" && !safeBookingUrl(body.booking_url))) {
      return NextResponse.json({ error: "Complete the required fields, including a sport, location, level and agreement. Referral booking links must use HTTPS." }, { status: 400 });
    }
    const { error } = await db.from("trainer_applications").insert({ user_id: viewer.id, full_name: textValue(body.full_name, 150), email: textValue(body.email, 254), phone: textValue(body.phone, 40), booking_mode: mode, sports, locations, level: body.level, background: textValue(body.background, 1000), playing_levels: stringList(body.playing_levels), coaching_experience: stringList(body.coaching_experience), availability: textValue(body.availability, 1000), motivation: textValue(body.motivation, 4000), insurance: textValue(body.insurance, 40), booking_url: mode === "referral" ? safeBookingUrl(body.booking_url) : null, business_name: textValue(body.business_name, 150), referral_discount: textValue(body.referral_discount, 300), terms_version: TRAINER_TERMS_VERSION, terms_accepted_at: new Date().toISOString(), status: "pending" });
    if (error) return NextResponse.json({ error: error.code === "23505" ? "You already have an application under review." : "Could not save your application. Please try again." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Could not submit application." }, { status: 500 }); }
}

export async function GET(req: NextRequest) {
  const viewer = await getAuthenticatedProfile(req);
  if (!viewer || !["admin", "owner"].includes(viewer.role ?? "")) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const db = getSupabaseServiceRole();
  const result = await db?.from("trainer_applications").select("*").order("created_at", { ascending: false });
  if (!result || result.error) return NextResponse.json({ error: "Could not load applications." }, { status: 500 });
  return NextResponse.json({ applications: result.data });
}
