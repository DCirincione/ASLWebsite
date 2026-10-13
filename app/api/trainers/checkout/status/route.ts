import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedProfile, getSupabaseServiceRole } from "@/lib/admin-route-auth";
import { confirmTrainerCheckout } from "@/lib/trainer-payments";
export async function GET(req: NextRequest) {
  try {
    const viewer = await getAuthenticatedProfile(req), db = getSupabaseServiceRole();
    if (!viewer || !db) return NextResponse.json({ error: "Please sign in to view this booking." }, { status: 401 });
    const { data } = await db.from("trainer_checkouts").select("id,status,square_order_id").eq("id", req.nextUrl.searchParams.get("id")).eq("user_id", viewer.id).maybeSingle();
    if (!data) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    if (data.square_order_id && data.status !== "paid") await confirmTrainerCheckout(data.square_order_id);
    const { data: current } = await db.from("trainer_checkouts").select("status").eq("id", data.id).single();
    return NextResponse.json({ status: current?.status ?? data.status });
  } catch { return NextResponse.json({ error: "Could not verify payment yet. Please try again." }, { status: 503 }); }
}
