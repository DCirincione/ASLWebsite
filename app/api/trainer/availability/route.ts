import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedProfile, getSupabaseServiceRole } from "@/lib/admin-route-auth";
import { canAccessTrainerPortal } from "@/lib/event-approval";
import type { TrainerProfile } from "@/lib/supabase/types";

type AvailabilityBody = Partial<{
  trainerId: unknown;
  startsAt: unknown;
  endsAt: unknown;
  slotId: unknown;
  status: unknown;
}>;

const trimString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const canManageProfile = (viewerId: string, role: string | null | undefined, trainer: Pick<TrainerProfile, "user_id">) =>
  trainer.user_id === viewerId || role === "admin" || role === "owner";

export async function POST(req: NextRequest) {
  try {
    const viewer = await getAuthenticatedProfile(req);
    if (!viewer) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!canAccessTrainerPortal(viewer.role)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

    const supabase = getSupabaseServiceRole();
    if (!supabase) return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });

    const body = (await req.json()) as AvailabilityBody;
    const trainerId = trimString(body.trainerId);
    const startsAt = trimString(body.startsAt);
    const endsAt = trimString(body.endsAt);

    if (!trainerId || !startsAt || !endsAt) {
      return NextResponse.json({ error: "Trainer, start time, and end time are required." }, { status: 400 });
    }

    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });
    }

    const { data: trainer } = await supabase
      .from("trainer_profiles")
      .select("id,user_id")
      .eq("id", trainerId)
      .maybeSingle();
    if (!trainer || !canManageProfile(viewer.id, viewer.role, trainer as TrainerProfile)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("trainer_availability_slots")
      .insert({
        trainer_id: trainerId,
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        status: "available",
      })
      .select("*")
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Could not add availability." }, { status: 500 });
    }

    return NextResponse.json({ slot: data });
  } catch {
    return NextResponse.json({ error: "Could not add availability." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const viewer = await getAuthenticatedProfile(req);
    if (!viewer) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!canAccessTrainerPortal(viewer.role)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

    const supabase = getSupabaseServiceRole();
    if (!supabase) return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });

    const body = (await req.json()) as AvailabilityBody;
    const slotId = trimString(body.slotId);
    const status = body.status === "cancelled" || body.status === "available" ? body.status : null;
    if (!slotId || !status) {
      return NextResponse.json({ error: "Slot and status are required." }, { status: 400 });
    }

    const { data: slot } = await supabase
      .from("trainer_availability_slots")
      .select("id,trainer_id")
      .eq("id", slotId)
      .maybeSingle();
    if (!slot) return NextResponse.json({ error: "Availability slot not found." }, { status: 404 });

    const { data: trainer } = await supabase
      .from("trainer_profiles")
      .select("id,user_id")
      .eq("id", slot.trainer_id)
      .maybeSingle();
    if (!trainer || !canManageProfile(viewer.id, viewer.role, trainer as TrainerProfile)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("trainer_availability_slots")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", slotId)
      .select("*")
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Could not update availability." }, { status: 500 });
    }

    return NextResponse.json({ slot: data });
  } catch {
    return NextResponse.json({ error: "Could not update availability." }, { status: 500 });
  }
}
