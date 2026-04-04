import { NextRequest, NextResponse } from "next/server";

import { getSupabaseServiceRole, isAdminOrOwner } from "@/lib/admin-route-auth";
import type { JsonValue } from "@/lib/supabase/types";

type EventDraftPayment = {
  submission_id?: string | null;
  amount_cents?: number | null;
  status?: "pending" | "paid" | "completed" | "failed" | "expired" | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type SundayLeagueDraftPayment = {
  team_id?: string | null;
  user_id?: string | null;
  division?: 1 | 2 | null;
  slot_number?: number | null;
  team_payload?: JsonValue | null;
  amount_cents?: number | null;
  status?: "pending" | "paid" | "completed" | "failed" | "expired" | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const allowed = await isAdminOrOwner(req);
    if (!allowed) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const supabase = getSupabaseServiceRole();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
    }

    const [{ data: eventDrafts, error: eventDraftsError }, { data: sundayLeagueDrafts, error: sundayLeagueDraftsError }] =
      await Promise.all([
        supabase
          .from("event_checkout_drafts")
          .select("submission_id,amount_cents,status,updated_at,created_at")
          .in("status", ["paid", "completed"]),
        supabase
          .from("sunday_league_team_checkout_drafts")
          .select("team_id,user_id,division,slot_number,team_payload,amount_cents,status,updated_at,created_at")
          .in("status", ["paid", "completed"]),
      ]);

    if (eventDraftsError || sundayLeagueDraftsError) {
      return NextResponse.json(
        { error: eventDraftsError?.message ?? sundayLeagueDraftsError?.message ?? "Could not load registration payments." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      eventDrafts: (eventDrafts ?? []) as EventDraftPayment[],
      sundayLeagueDrafts: (sundayLeagueDrafts ?? []) as SundayLeagueDraftPayment[],
    });
  } catch {
    return NextResponse.json({ error: "Could not load registration payments." }, { status: 500 });
  }
}
