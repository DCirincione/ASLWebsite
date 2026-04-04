import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedProfile, getSupabaseServiceRole } from "@/lib/admin-route-auth";
import { canAccessAdminDashboard, trimOptionalString } from "@/lib/event-approval";

type ApprovalBody = {
  status?: unknown;
  notes?: unknown;
};

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  try {
    const profile = await getAuthenticatedProfile(req);
    if (!profile) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!canAccessAdminDashboard(profile.role)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { eventId } = await context.params;
    const normalizedEventId = eventId?.trim();
    if (!normalizedEventId) {
      return NextResponse.json({ error: "Event ID is required." }, { status: 400 });
    }

    const body = (await req.json()) as ApprovalBody;
    const status = body.status === "changes_requested" ? "changes_requested" : body.status === "approved" ? "approved" : null;
    if (!status) {
      return NextResponse.json({ error: "A valid approval status is required." }, { status: 400 });
    }

    const supabase = getSupabaseServiceRole();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
    }

    const approvalNotes = trimOptionalString(body.notes);
    const payload =
      status === "approved"
        ? {
            approval_status: status,
            approval_notes: approvalNotes,
            approved_at: new Date().toISOString(),
            approved_by_user_id: profile.id,
          }
        : {
            approval_status: status,
            approval_notes: approvalNotes,
            approved_at: null,
            approved_by_user_id: null,
          };

    const { data, error } = await supabase
      .from("events")
      .update(payload)
      .eq("id", normalizedEventId)
      .eq("host_type", "partner")
      .select(
        "id,title,approval_status,approval_notes,approved_at,approved_by_user_id,created_by_user_id,submitted_for_approval_at"
      )
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Could not update the approval status." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, event: data });
  } catch {
    return NextResponse.json({ error: "Could not update the approval status." }, { status: 500 });
  }
}
