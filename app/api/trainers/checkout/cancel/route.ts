import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedProfile, getSupabaseServiceRole } from "@/lib/admin-route-auth";
import { cancelTrainerCheckout } from "@/lib/trainer-payments";
export async function POST(req: NextRequest) {
  try {
    const viewer = await getAuthenticatedProfile(req), db = getSupabaseServiceRole();
    if (!viewer || !db) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const body = await req.json();
    const { data } = await db.from("trainer_checkouts").select("*").eq("id", body.id).maybeSingle();
    if (!data || (data.user_id !== viewer.id && !["admin", "owner"].includes(viewer.role ?? ""))) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    await cancelTrainerCheckout(data);
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Could not cancel checkout." }, { status: 409 }); }
}
