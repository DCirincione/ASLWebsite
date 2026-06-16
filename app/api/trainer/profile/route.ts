import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedProfile, getSupabaseServiceRole } from "@/lib/admin-route-auth";
import { canAccessTrainerPortal, trimOptionalString } from "@/lib/event-approval";
import type { JsonValue, TrainerProfile, TrainerProfileInsert, TrainerProfileStatus, TrainerProfileUpdate } from "@/lib/supabase/types";

type TrainerProfileBody = Partial<{
  id: unknown;
  slug: unknown;
  display_name: unknown;
  headline: unknown;
  bio: unknown;
  sport: unknown;
  location: unknown;
  headshot_url: unknown;
  flyer_url: unknown;
  specialties: unknown;
  session_options: unknown;
  status: unknown;
}>;

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const isStatus = (value: unknown): value is TrainerProfileStatus =>
  value === "draft" || value === "pending_approval" || value === "approved" || value === "hidden";

const sanitizeStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.flatMap((entry) => (typeof entry === "string" && entry.trim() ? [entry.trim()] : []))
    : [];

const sanitizeSessionOptions = (value: unknown): JsonValue => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const name = trimOptionalString(record.name);
    if (!name) return [];
    const duration = trimOptionalString(record.duration) ?? "";
    const price = trimOptionalString(record.price) ?? "";
    const description = trimOptionalString(record.description) ?? "";

    return [{
      name,
      duration,
      price,
      ...(description ? { description } : {}),
    }];
  });
};

const selectProfileColumns =
  "id,user_id,slug,display_name,headline,bio,sport,location,headshot_url,flyer_url,specialties,session_options,status,created_at,updated_at";

const canManageProfile = (viewerId: string, role: string | null | undefined, trainer: Pick<TrainerProfile, "user_id">) =>
  trainer.user_id === viewerId || role === "admin" || role === "owner";

export async function GET(req: NextRequest) {
  try {
    const viewer = await getAuthenticatedProfile(req);
    if (!viewer) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!canAccessTrainerPortal(viewer.role)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

    const supabase = getSupabaseServiceRole();
    if (!supabase) return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });

    const trainerId = req.nextUrl.searchParams.get("trainerId")?.trim();
    let query = supabase.from("trainer_profiles").select(selectProfileColumns);
    query = trainerId ? query.eq("id", trainerId) : query.eq("user_id", viewer.id);

    const { data: profile, error } = await query.maybeSingle();
    if (error) return NextResponse.json({ error: error.message ?? "Could not load trainer profile." }, { status: 500 });
    if (profile && !canManageProfile(viewer.id, viewer.role, profile as TrainerProfile)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const slotsQuery = profile
      ? supabase
          .from("trainer_availability_slots")
          .select("*")
          .eq("trainer_id", profile.id)
          .gte("starts_at", new Date().toISOString())
          .order("starts_at", { ascending: true })
      : Promise.resolve({ data: [], error: null });

    const bookingsQuery = profile
      ? supabase
          .from("trainer_bookings")
          .select("*")
          .eq("trainer_id", profile.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null });

    const [{ data: slots }, { data: bookings }] = await Promise.all([slotsQuery, bookingsQuery]);
    return NextResponse.json({ profile, slots: slots ?? [], bookings: bookings ?? [] });
  } catch {
    return NextResponse.json({ error: "Could not load trainer profile." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const viewer = await getAuthenticatedProfile(req);
    if (!viewer) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!canAccessTrainerPortal(viewer.role)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

    const supabase = getSupabaseServiceRole();
    if (!supabase) return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });

    const body = (await req.json()) as TrainerProfileBody;
    const displayName = trimOptionalString(body.display_name);
    if (!displayName) return NextResponse.json({ error: "Display name is required." }, { status: 400 });

    const existingId = trimOptionalString(body.id);
    const { data: existing } = existingId
      ? await supabase.from("trainer_profiles").select(selectProfileColumns).eq("id", existingId).maybeSingle()
      : await supabase.from("trainer_profiles").select(selectProfileColumns).eq("user_id", viewer.id).maybeSingle();

    if (existing && !canManageProfile(viewer.id, viewer.role, existing as TrainerProfile)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const requestedSlug = trimOptionalString(body.slug);
    const baseSlug = slugify(requestedSlug || displayName);
    const slug = baseSlug || `trainer-${viewer.id.slice(0, 8)}`;
    const requestedStatus = isStatus(body.status) ? body.status : undefined;
    const status = viewer.role === "admin" || viewer.role === "owner"
      ? requestedStatus ?? (existing as TrainerProfile | null)?.status ?? "draft"
      : (existing as TrainerProfile | null)?.status ?? "pending_approval";

    const payload = {
      slug,
      display_name: displayName,
      headline: trimOptionalString(body.headline) ?? "",
      bio: trimOptionalString(body.bio) ?? "",
      sport: trimOptionalString(body.sport) ?? "",
      location: trimOptionalString(body.location) ?? "",
      headshot_url: trimOptionalString(body.headshot_url),
      flyer_url: trimOptionalString(body.flyer_url),
      specialties: sanitizeStringArray(body.specialties),
      session_options: sanitizeSessionOptions(body.session_options),
      status,
      updated_at: new Date().toISOString(),
    } satisfies TrainerProfileUpdate;

    const query = existing
      ? supabase.from("trainer_profiles").update(payload).eq("id", (existing as TrainerProfile).id)
      : supabase.from("trainer_profiles").insert({
          ...payload,
          user_id: viewer.id,
        } satisfies TrainerProfileInsert);

    const { data, error } = await query.select(selectProfileColumns).maybeSingle();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Could not save trainer profile." }, { status: 500 });
    }

    return NextResponse.json({ profile: data });
  } catch {
    return NextResponse.json({ error: "Could not save trainer profile." }, { status: 500 });
  }
}
