import { getSupabaseServer } from "@/lib/admin-route-auth";
import type { JsonValue, TrainerAvailabilitySlot, TrainerProfile as TrainerProfileRow } from "@/lib/supabase/types";

export type TrainerSessionType = {
  name: string;
  duration: string;
  durationMinutes?: number;
  price: string;
  priceCents?: number;
  description?: string;
};

export type TrainerAvailabilityDay = {
  date: string;
  slots: Array<{
    id: string;
    startsAt: string;
    endsAt: string;
    label: string;
  }>;
};

export type TrainerProfile = {
  id: string;
  userId: string;
  slug: string;
  name: string;
  headline: string;
  sport: string;
  location: string;
  bio: string;
  specialties: string[];
  sessionTypes: TrainerSessionType[];
  headshotUrl: string;
  flyerUrl: string;
  status: TrainerProfileRow["status"];
  availability: TrainerAvailabilityDay[];
};

const fallbackHeadshot = "/ASLLogo.png";
const fallbackFlyer = "/home-hero/Aldrich Sports Leagues.png";

const isRecord = (value: JsonValue | unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeSpecialties = (value: JsonValue): string[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => (typeof entry === "string" && entry.trim() ? [entry.trim()] : []));
};

const normalizeSessionTypes = (value: JsonValue): TrainerSessionType[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!name) return [];

    const durationMinutes = typeof entry.durationMinutes === "number" ? entry.durationMinutes : undefined;
    const duration = typeof entry.duration === "string" && entry.duration.trim()
      ? entry.duration.trim()
      : durationMinutes
        ? `${durationMinutes} min`
        : "";
    const priceCents = typeof entry.priceCents === "number" ? entry.priceCents : undefined;
    const price = typeof entry.price === "string" && entry.price.trim()
      ? entry.price.trim()
      : priceCents !== undefined
        ? `$${(priceCents / 100).toFixed(2)}`
        : "";
    const description = typeof entry.description === "string" ? entry.description.trim() : "";

    return [{
      name,
      duration,
      durationMinutes,
      price,
      priceCents,
      ...(description ? { description } : {}),
    }];
  });
};

const formatSlotTime = (startsAt: string, endsAt: string) => {
  const startDate = new Date(startsAt);
  const endDate = new Date(endsAt);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return "Time TBD";

  return `${startDate.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })} - ${endDate.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
};

const groupAvailabilitySlots = (slots: TrainerAvailabilitySlot[]): TrainerAvailabilityDay[] => {
  const grouped = new Map<string, TrainerAvailabilityDay>();

  for (const slot of slots) {
    const date = slot.starts_at.slice(0, 10);
    if (!grouped.has(date)) {
      grouped.set(date, { date, slots: [] });
    }
    grouped.get(date)?.slots.push({
      id: slot.id,
      startsAt: slot.starts_at,
      endsAt: slot.ends_at,
      label: formatSlotTime(slot.starts_at, slot.ends_at),
    });
  }

  return Array.from(grouped.values()).map((day) => ({
    ...day,
    slots: day.slots.sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
  }));
};

export const normalizeTrainerProfile = (
  trainer: TrainerProfileRow,
  slots: TrainerAvailabilitySlot[] = [],
): TrainerProfile => ({
  id: trainer.id,
  userId: trainer.user_id,
  slug: trainer.slug,
  name: trainer.display_name,
  headline: trainer.headline,
  sport: trainer.sport,
  location: trainer.location,
  bio: trainer.bio,
  specialties: normalizeSpecialties(trainer.specialties),
  sessionTypes: normalizeSessionTypes(trainer.session_options),
  headshotUrl: trainer.headshot_url || fallbackHeadshot,
  flyerUrl: trainer.flyer_url || fallbackFlyer,
  status: trainer.status,
  availability: groupAvailabilitySlots(slots),
});

export const getPublicTrainers = async () => {
  const supabase = getSupabaseServer();
  if (!supabase) return [];

  const { data: trainers, error } = await supabase
    .from("trainer_profiles")
    .select("*")
    .eq("status", "approved")
    .order("display_name", { ascending: true });

  if (error || !trainers?.length) return [];

  const trainerRows = trainers as TrainerProfileRow[];
  const { data: slots } = await supabase
    .from("trainer_availability_slots")
    .select("*")
    .in("trainer_id", trainerRows.map((trainer) => trainer.id))
    .eq("status", "available")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });

  const slotsByTrainerId = new Map<string, TrainerAvailabilitySlot[]>();
  for (const slot of (slots ?? []) as TrainerAvailabilitySlot[]) {
    slotsByTrainerId.set(slot.trainer_id, [...(slotsByTrainerId.get(slot.trainer_id) ?? []), slot]);
  }

  return trainerRows.map((trainer) => normalizeTrainerProfile(trainer, slotsByTrainerId.get(trainer.id) ?? []));
};

export const getPublicTrainerBySlug = async (slug: string) => {
  const supabase = getSupabaseServer();
  if (!supabase) return null;

  const { data: trainer, error } = await supabase
    .from("trainer_profiles")
    .select("*")
    .eq("slug", slug)
    .eq("status", "approved")
    .maybeSingle();

  if (error || !trainer) return null;

  const { data: slots } = await supabase
    .from("trainer_availability_slots")
    .select("*")
    .eq("trainer_id", trainer.id)
    .eq("status", "available")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });

  return normalizeTrainerProfile(trainer as TrainerProfileRow, (slots ?? []) as TrainerAvailabilitySlot[]);
};
