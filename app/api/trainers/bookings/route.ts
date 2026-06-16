import { NextRequest, NextResponse } from "next/server";

import { getSupabaseServiceRole } from "@/lib/admin-route-auth";
import type { JsonValue, TrainerAvailabilitySlot, TrainerProfile } from "@/lib/supabase/types";
import { parseSessionDurationMinutes } from "@/lib/trainers";

type BookingRequestBody = Partial<{
  trainerId: unknown;
  availabilitySlotId: unknown;
  sessionOptionName: unknown;
  customerName: unknown;
  customerEmail: unknown;
  customerPhone: unknown;
  notes: unknown;
}>;

const trimString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const isRecord = (value: JsonValue | unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const findSessionOptionSnapshot = (sessionOptions: JsonValue, sessionOptionName: string): JsonValue => {
  if (!Array.isArray(sessionOptions)) return {};
  const match = sessionOptions.find((option) => isRecord(option) && option.name === sessionOptionName);
  return isRecord(match) ? match as JsonValue : {};
};

const getSlotDurationMinutes = (slot: Pick<TrainerAvailabilitySlot, "starts_at" | "ends_at">) => {
  const startsAt = new Date(slot.starts_at);
  const endsAt = new Date(slot.ends_at);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return null;
  const duration = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
  return duration > 0 ? duration : null;
};

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseServiceRole();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
    }

    const body = (await req.json()) as BookingRequestBody;
    const trainerId = trimString(body.trainerId);
    const availabilitySlotId = trimString(body.availabilitySlotId);
    const sessionOptionName = trimString(body.sessionOptionName);
    const customerName = trimString(body.customerName);
    const customerEmail = trimString(body.customerEmail);
    const customerPhone = trimString(body.customerPhone);
    const notes = trimString(body.notes) || null;

    if (!trainerId || !availabilitySlotId || !sessionOptionName || !customerName || !customerEmail || !customerPhone) {
      return NextResponse.json({ error: "Choose a session time and enter your name, email, and phone number." }, { status: 400 });
    }

    const { data: trainer, error: trainerError } = await supabase
      .from("trainer_profiles")
      .select("*")
      .eq("id", trainerId)
      .eq("status", "approved")
      .maybeSingle();

    if (trainerError || !trainer) {
      return NextResponse.json({ error: "Trainer is not available for booking." }, { status: 404 });
    }

    const trainerRow = trainer as TrainerProfile;
    const sessionOptionSnapshot = findSessionOptionSnapshot(trainerRow.session_options, sessionOptionName);
    if (isRecord(sessionOptionSnapshot) && Object.keys(sessionOptionSnapshot).length === 0) {
      return NextResponse.json({ error: "Choose a valid session option." }, { status: 400 });
    }
    const sessionDuration = isRecord(sessionOptionSnapshot) && typeof sessionOptionSnapshot.duration === "string"
      ? parseSessionDurationMinutes(sessionOptionSnapshot.duration)
      : null;

    const { data: claimedSlot, error: slotError } = await supabase
      .from("trainer_availability_slots")
      .update({ status: "booked", updated_at: new Date().toISOString() })
      .eq("id", availabilitySlotId)
      .eq("trainer_id", trainerId)
      .eq("status", "available")
      .gte("starts_at", new Date().toISOString())
      .select("*")
      .maybeSingle();

    if (slotError || !claimedSlot) {
      return NextResponse.json({ error: "That time is no longer available." }, { status: 409 });
    }

    const slot = claimedSlot as TrainerAvailabilitySlot;
    const slotDuration = getSlotDurationMinutes(slot);
    if (!sessionDuration || slotDuration !== sessionDuration) {
      await supabase
        .from("trainer_availability_slots")
        .update({ status: "available", updated_at: new Date().toISOString() })
        .eq("id", slot.id)
        .eq("status", "booked");

      return NextResponse.json({ error: "That time is not available for the selected session option." }, { status: 409 });
    }

    const { data: booking, error: bookingError } = await supabase
      .from("trainer_bookings")
      .insert({
        trainer_id: trainerId,
        availability_slot_id: slot.id,
        session_option_snapshot: sessionOptionSnapshot,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        notes,
        status: "requested",
      })
      .select("*")
      .maybeSingle();

    if (bookingError || !booking) {
      await supabase
        .from("trainer_availability_slots")
        .update({ status: "available", updated_at: new Date().toISOString() })
        .eq("id", slot.id)
        .eq("status", "booked");

      return NextResponse.json({ error: bookingError?.message ?? "Could not create the booking." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, booking });
  } catch {
    return NextResponse.json({ error: "Could not create the booking." }, { status: 500 });
  }
}
