import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedProfile, getSupabaseServiceRole } from "@/lib/admin-route-auth";
import { getAppUrl, getSquareLocationId } from "@/lib/square";
import { trainerPaymentLink } from "@/lib/trainer-payments";
import { textValue, TRAINER_WAIVER_VERSION } from "@/lib/trainer-network";

export async function POST(req: NextRequest) {
  try {
    const viewer = await getAuthenticatedProfile(req);
    if (!viewer) return NextResponse.json({ error: "Please sign in to book." }, { status: 401 });
    const db = getSupabaseServiceRole();
    if (!db || !getSquareLocationId() || !getAppUrl()) return NextResponse.json({ error: "Online payments are not configured yet. Please contact Aldrich." }, { status: 503 });
    const body = await req.json();
    const participant = textValue(body.participantName, 150), customer = textValue(body.customerName, 150);
    const who = body.participantType, age = Number(body.participantAge);
    const signature = textValue(body.signature, 150);
    if (body.waiverAccepted !== true || !signature || signature.toLowerCase() !== (who === "child" ? customer : participant).toLowerCase()) {
      return NextResponse.json({ error: "Accept the waiver and sign with the athlete’s full name, or the parent/guardian’s full name for a child." }, { status: 400 });
    }
    if (!/^[0-9a-f-]{36}$/i.test(textValue(body.checkoutId)) || !body.trainerId || !body.availabilitySlotId || !body.sessionOptionName || !participant || !customer || !["self", "child", "other"].includes(who) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(textValue(body.customerEmail)) || !textValue(body.customerPhone) || (who === "child" && (!Number.isInteger(age) || age < 4 || age > 17))) {
      return NextResponse.json({ error: "Complete the participant and contact fields." }, { status: 400 });
    }
    const { data, error } = await db.rpc("reserve_trainer_checkout", { p_id: body.checkoutId, p_user_id: viewer.id, p_trainer_id: body.trainerId, p_slot_id: body.availabilitySlotId, p_session_name: textValue(body.sessionOptionName, 150), p_customer: { name: customer, email: textValue(body.customerEmail, 254), phone: textValue(body.customerPhone, 40), notes: textValue(body.notes, 1000) }, p_participant: { type: who, name: participant, age: who === "child" ? age : null, waiver_status: "accepted", signature, waiver_version: TRAINER_WAIVER_VERSION, accepted_at: new Date().toISOString() } });
    if (error || !data) return NextResponse.json({ error: "That session is unavailable or has changed. Close the booking panel and choose another time." }, { status: 409 });
    const draft = Array.isArray(data) ? data[0] : data;
    if (draft.status === "paid") return NextResponse.json({ url: `${getAppUrl()}/trainers/confirmation?id=${draft.id}` });
    if (draft.checkout_url) return NextResponse.json({ url: draft.checkout_url });
    const link = await trainerPaymentLink(draft);
    return NextResponse.json({ url: link.url });
  } catch { return NextResponse.json({ error: "Could not open checkout. Your time is held; try again to resume the same checkout." }, { status: 500 }); }
}
