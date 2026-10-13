import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedProfile, getSupabaseServiceRole } from "@/lib/admin-route-auth";
import { textValue } from "@/lib/trainer-network";
export async function POST(req: NextRequest) {
  try {
    const viewer = await getAuthenticatedProfile(req), db = getSupabaseServiceRole();
    if (!viewer || !["admin", "owner"].includes(viewer.role ?? "") || !db) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    const body = await req.json();
    if (!body.id || !["approve", "reject"].includes(body.action) || (body.action === "approve" && !["Rising", "Collegiate", "Elite"].includes(body.level))) return NextResponse.json({ error: "Select an application, action and approved level." }, { status: 400 });
    const { data, error } = await db.rpc("review_trainer_application", { p_id: body.id, p_reviewer_id: viewer.id, p_approve: body.action === "approve", p_level: body.level ?? null, p_quote: textValue(body.quote), p_referral_code: textValue(body.referralCode, 60) });
    if (error) return NextResponse.json({ error: "Could not review this application. It may already have been reviewed." }, { status: 409 });
    return NextResponse.json({ ok: true, trainerId: data });
  } catch { return NextResponse.json({ error: "Could not review application." }, { status: 500 }); }
}
