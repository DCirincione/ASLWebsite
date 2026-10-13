import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedProfile, getSupabaseServiceRole } from "@/lib/admin-route-auth";
import { easternSessionTime } from "@/lib/trainer-time";
export async function POST(req: NextRequest) {
  try {
    const viewer = await getAuthenticatedProfile(req), db = getSupabaseServiceRole();
    if (!viewer || !db) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const body = await req.json();
    const { data: trainer } = await db.from("trainer_profiles").select("user_id").eq("id", body.trainerId).maybeSingle();
    if (!trainer || (trainer.user_id !== viewer.id && !["admin", "owner"].includes(viewer.role ?? ""))) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    const from = easternSessionTime(body.from, "00:00");
    const last = new Date(`${body.to}T12:00:00Z`); last.setUTCDate(last.getUTCDate() + 1);
    const until = easternSessionTime(last.toISOString().slice(0, 10), "00:00");
    if (until <= from) return NextResponse.json({ error: "Choose a valid date range." }, { status: 400 });
    const { error } = await db.rpc("block_trainer_dates", { p_trainer_id: body.trainerId, p_from: from.toISOString(), p_until: until.toISOString() });
    if (error) return NextResponse.json({ error: "This range includes booked or held times. Resolve those sessions before blocking the dates." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Could not block dates." }, { status: 400 }); }
}
