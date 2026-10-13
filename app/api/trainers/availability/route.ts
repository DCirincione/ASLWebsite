import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/admin-route-auth";
import { releaseExpiredTrainerCheckouts } from "@/lib/trainer-payments";
export async function GET(req: NextRequest) {
  const db = getSupabaseServer(), id = req.nextUrl.searchParams.get("trainerId");
  if (!db || !id) return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  const { data: trainer } = await db.from("trainer_profiles").select("id,booking_mode").eq("id", id).eq("status", "approved").maybeSingle();
  if (!trainer || trainer.booking_mode === "referral") return NextResponse.json({ error: "Trainer unavailable." }, { status: 404 });
  await releaseExpiredTrainerCheckouts(id);
  const { data, error } = await db.from("trainer_availability_slots").select("id,starts_at,ends_at,location,venue_fee_cents").eq("trainer_id", id).eq("status", "available").gt("starts_at", new Date().toISOString()).order("starts_at");
  if (error) return NextResponse.json({ error: "Could not load availability." }, { status: 500 });
  return NextResponse.json({ slots: data });
}
