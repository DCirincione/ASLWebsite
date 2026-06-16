"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";

import "./training.css";

import { HistoryBackButton } from "@/components/history-back-button";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { canAccessTrainerPortal } from "@/lib/event-approval";
import { supabase } from "@/lib/supabase/client";
import type { TrainerAvailabilitySlot, TrainerBooking, TrainerProfile } from "@/lib/supabase/types";

type SaveStatus = { type: "idle" | "loading" | "success" | "error"; message?: string };

type SessionOptionDraft = {
  name: string;
  duration: string;
  price: string;
  description: string;
};

type TrainerProfileForm = {
  id: string;
  slug: string;
  display_name: string;
  headline: string;
  bio: string;
  sport: string;
  location: string;
  headshot_url: string;
  flyer_url: string;
  specialtiesText: string;
  status: TrainerProfile["status"];
  session_options: SessionOptionDraft[];
};

const emptyForm = (): TrainerProfileForm => ({
  id: "",
  slug: "",
  display_name: "",
  headline: "",
  bio: "",
  sport: "",
  location: "",
  headshot_url: "",
  flyer_url: "",
  specialtiesText: "",
  status: "draft",
  session_options: [
    { name: "", duration: "", price: "", description: "" },
    { name: "", duration: "", price: "", description: "" },
    { name: "", duration: "", price: "", description: "" },
  ],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeSessionOptions = (value: unknown): SessionOptionDraft[] => {
  const options = Array.isArray(value)
    ? value.flatMap((entry) => {
        if (!isRecord(entry)) return [];
        return [{
          name: typeof entry.name === "string" ? entry.name : "",
          duration: typeof entry.duration === "string" ? entry.duration : "",
          price: typeof entry.price === "string" ? entry.price : "",
          description: typeof entry.description === "string" ? entry.description : "",
        }];
      })
    : [];

  while (options.length < 3) {
    options.push({ name: "", duration: "", price: "", description: "" });
  }

  return options.slice(0, 3);
};

const mapProfileToForm = (profile: TrainerProfile | null, fallbackName: string): TrainerProfileForm => {
  if (!profile) {
    return {
      ...emptyForm(),
      display_name: fallbackName,
    };
  }

  return {
    id: profile.id,
    slug: profile.slug,
    display_name: profile.display_name,
    headline: profile.headline,
    bio: profile.bio,
    sport: profile.sport,
    location: profile.location,
    headshot_url: profile.headshot_url ?? "",
    flyer_url: profile.flyer_url ?? "",
    specialtiesText: Array.isArray(profile.specialties)
      ? profile.specialties.filter((entry): entry is string => typeof entry === "string").join(", ")
      : "",
    status: profile.status,
    session_options: normalizeSessionOptions(profile.session_options),
  };
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function TrainingPage() {
  const [accessStatus, setAccessStatus] = useState<"loading" | "allowed" | "no-session" | "forbidden">("loading");
  const [isAdmin, setIsAdmin] = useState(false);
  const [form, setForm] = useState<TrainerProfileForm>(() => emptyForm());
  const [slots, setSlots] = useState<TrainerAvailabilitySlot[]>([]);
  const [bookings, setBookings] = useState<TrainerBooking[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ type: "idle" });
  const [slotStatus, setSlotStatus] = useState<SaveStatus>({ type: "idle" });
  const [uploadStatus, setUploadStatus] = useState<SaveStatus>({ type: "idle" });
  const [slotStart, setSlotStart] = useState("");
  const [slotEnd, setSlotEnd] = useState("");

  const fetchWithSession = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const { data } = await supabase!.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sign in again to continue.");

    return fetch(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });
  }, []);

  const loadTrainerProfile = useCallback(async () => {
    if (!supabase) {
      setAccessStatus("forbidden");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      setAccessStatus("no-session");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("name,role")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.role ?? null;
    if (!canAccessTrainerPortal(role)) {
      setAccessStatus("forbidden");
      return;
    }

    setIsAdmin(role === "admin" || role === "owner");
    setAccessStatus("allowed");

    const response = await fetchWithSession("/api/trainer/profile");
    const json = (await response.json()) as {
      profile?: TrainerProfile | null;
      slots?: TrainerAvailabilitySlot[];
      bookings?: TrainerBooking[];
      error?: string;
    };
    if (!response.ok) throw new Error(json.error ?? "Could not load trainer profile.");

    setForm(mapProfileToForm(json.profile ?? null, profile?.name ?? ""));
    setSlots(json.slots ?? []);
    setBookings(json.bookings ?? []);
  }, [fetchWithSession]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadTrainerProfile().catch((error) => {
        setAccessStatus("forbidden");
        setSaveStatus({ type: "error", message: error instanceof Error ? error.message : "Could not load trainer profile." });
      });
    }, 0);

    return () => window.clearTimeout(handle);
  }, [loadTrainerProfile]);

  const publicProfileHref = form.slug ? `/trainers/${form.slug}` : "";

  const sessionOptions = useMemo(
    () => form.session_options.map((option) => ({
      name: option.name.trim(),
      duration: option.duration.trim(),
      price: option.price.trim(),
      description: option.description.trim(),
    })).filter((option) => option.name),
    [form.session_options],
  );

  const updateForm = <K extends keyof TrainerProfileForm>(key: K, value: TrainerProfileForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateSessionOption = (index: number, key: keyof SessionOptionDraft, value: string) => {
    setForm((prev) => ({
      ...prev,
      session_options: prev.session_options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, [key]: value } : option,
      ),
    }));
  };

  const handleUpload = async (kind: "trainer-headshot" | "trainer-flyer", event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploadStatus({ type: "loading", message: "Uploading..." });
    try {
      const formData = new FormData();
      formData.set("kind", kind);
      formData.set("file", file);
      const response = await fetchWithSession("/api/partner/upload", {
        method: "POST",
        body: formData,
      });
      const json = (await response.json()) as { fileUrl?: string; error?: string };
      if (!response.ok || !json.fileUrl) throw new Error(json.error ?? "Could not upload file.");
      updateForm(kind === "trainer-headshot" ? "headshot_url" : "flyer_url", json.fileUrl);
      setUploadStatus({ type: "success", message: "Upload complete. Save your profile to publish the new URL." });
    } catch (error) {
      setUploadStatus({ type: "error", message: error instanceof Error ? error.message : "Could not upload file." });
    }
  };

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveStatus({ type: "loading", message: "Saving trainer profile..." });
    try {
      const response = await fetchWithSession("/api/trainer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id || undefined,
          slug: form.slug,
          display_name: form.display_name,
          headline: form.headline,
          bio: form.bio,
          sport: form.sport,
          location: form.location,
          headshot_url: form.headshot_url,
          flyer_url: form.flyer_url,
          specialties: form.specialtiesText.split(",").map((entry) => entry.trim()).filter(Boolean),
          session_options: sessionOptions,
          status: isAdmin ? form.status : undefined,
        }),
      });
      const json = (await response.json()) as { profile?: TrainerProfile; error?: string };
      if (!response.ok || !json.profile) throw new Error(json.error ?? "Could not save trainer profile.");
      setForm(mapProfileToForm(json.profile, form.display_name));
      setSaveStatus({ type: "success", message: "Trainer profile saved." });
    } catch (error) {
      setSaveStatus({ type: "error", message: error instanceof Error ? error.message : "Could not save trainer profile." });
    }
  };

  const handleAddSlot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.id) {
      setSlotStatus({ type: "error", message: "Save your trainer profile before adding availability." });
      return;
    }
    setSlotStatus({ type: "loading", message: "Adding availability..." });
    try {
      const response = await fetchWithSession("/api/trainer/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainerId: form.id,
          startsAt: new Date(slotStart).toISOString(),
          endsAt: new Date(slotEnd).toISOString(),
        }),
      });
      const json = (await response.json()) as { slot?: TrainerAvailabilitySlot; error?: string };
      if (!response.ok || !json.slot) throw new Error(json.error ?? "Could not add availability.");
      setSlots((current) => [...current, json.slot!].sort((left, right) => left.starts_at.localeCompare(right.starts_at)));
      setSlotStart("");
      setSlotEnd("");
      setSlotStatus({ type: "success", message: "Availability added." });
    } catch (error) {
      setSlotStatus({ type: "error", message: error instanceof Error ? error.message : "Could not add availability." });
    }
  };

  const cancelSlot = async (slotId: string) => {
    setSlotStatus({ type: "loading", message: "Updating availability..." });
    try {
      const response = await fetchWithSession("/api/trainer/availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId, status: "cancelled" }),
      });
      const json = (await response.json()) as { slot?: TrainerAvailabilitySlot; error?: string };
      if (!response.ok || !json.slot) throw new Error(json.error ?? "Could not update availability.");
      setSlots((current) => current.map((slot) => (slot.id === slotId ? json.slot! : slot)));
      setSlotStatus({ type: "success", message: "Availability updated." });
    } catch (error) {
      setSlotStatus({ type: "error", message: error instanceof Error ? error.message : "Could not update availability." });
    }
  };

  if (accessStatus === "loading") {
    return (
      <PageShell>
        <Section id="training" title="Training Portal" headingLevel="h1">
          <p className="muted">Loading training portal...</p>
        </Section>
      </PageShell>
    );
  }

  if (accessStatus === "no-session" || accessStatus === "forbidden") {
    return (
      <PageShell>
        <Section id="training" title="Training Portal" headingLevel="h1">
          <p className="muted">
            {accessStatus === "no-session"
              ? "Sign in with a trainer, admin, or owner account to access this page."
              : "This page is available to trainers, admins, and owners."}
          </p>
        </Section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="training-page__back">
        <HistoryBackButton label="Back" fallbackHref="/events" />
      </div>
      <Section
        id="training"
        className="training-page"
        eyebrow="Trainer Portal"
        title="Training Page Manager"
        description="Edit your public trainer profile, session options, flyer, headshot, and availability."
        headingLevel="h1"
      >
        <form className="training-manager" onSubmit={handleSaveProfile}>
          <div className="training-panel">
            <div className="training-panel__header">
              <h2>Profile Content</h2>
              {publicProfileHref ? <Link className="button ghost" href={publicProfileHref}>View Public Page</Link> : null}
            </div>
            <div className="training-form-grid">
              <label>
                Display name
                <input value={form.display_name} onChange={(e) => updateForm("display_name", e.target.value)} required />
              </label>
              <label>
                Page slug
                <input value={form.slug} onChange={(e) => updateForm("slug", e.target.value)} placeholder="coach-name" />
              </label>
              <label>
                Sport
                <input value={form.sport} onChange={(e) => updateForm("sport", e.target.value)} />
              </label>
              <label>
                Location
                <input value={form.location} onChange={(e) => updateForm("location", e.target.value)} />
              </label>
              <label className="training-form-grid__full">
                Headline
                <input value={form.headline} onChange={(e) => updateForm("headline", e.target.value)} />
              </label>
              <label className="training-form-grid__full">
                Bio
                <textarea rows={5} value={form.bio} onChange={(e) => updateForm("bio", e.target.value)} />
              </label>
              <label className="training-form-grid__full">
                Specialties
                <input value={form.specialtiesText} onChange={(e) => updateForm("specialtiesText", e.target.value)} placeholder="Shooting, Speed, Small Groups" />
              </label>
              <label>
                Headshot URL
                <input value={form.headshot_url} onChange={(e) => updateForm("headshot_url", e.target.value)} />
              </label>
              <label>
                Upload headshot
                <input type="file" accept="image/*" onChange={(e) => void handleUpload("trainer-headshot", e)} />
              </label>
              <label>
                Flyer URL
                <input value={form.flyer_url} onChange={(e) => updateForm("flyer_url", e.target.value)} />
              </label>
              <label>
                Upload flyer
                <input type="file" accept="image/*" onChange={(e) => void handleUpload("trainer-flyer", e)} />
              </label>
              {isAdmin ? (
                <label>
                  Status
                  <select value={form.status} onChange={(e) => updateForm("status", e.target.value as TrainerProfile["status"])}>
                    <option value="draft">Draft</option>
                    <option value="pending_approval">Pending approval</option>
                    <option value="approved">Approved</option>
                    <option value="hidden">Hidden</option>
                  </select>
                </label>
              ) : null}
            </div>
            {uploadStatus.message ? <p className={`training-status training-status--${uploadStatus.type}`}>{uploadStatus.message}</p> : null}
          </div>

          <div className="training-panel">
            <h2>Session Options</h2>
            <div className="training-session-grid">
              {form.session_options.map((option, index) => (
                <div className="training-session-card" key={index}>
                  <label>
                    Name
                    <input value={option.name} onChange={(e) => updateSessionOption(index, "name", e.target.value)} placeholder="Private Session" />
                  </label>
                  <label>
                    Duration
                    <input value={option.duration} onChange={(e) => updateSessionOption(index, "duration", e.target.value)} placeholder="60 min" />
                  </label>
                  <label>
                    Price
                    <input value={option.price} onChange={(e) => updateSessionOption(index, "price", e.target.value)} placeholder="$75" />
                  </label>
                  <label>
                    Description
                    <textarea rows={3} value={option.description} onChange={(e) => updateSessionOption(index, "description", e.target.value)} />
                  </label>
                </div>
              ))}
            </div>
          </div>

          <button className="button primary" type="submit" disabled={saveStatus.type === "loading"}>
            {saveStatus.type === "loading" ? "Saving..." : "Save Trainer Profile"}
          </button>
          {saveStatus.message ? <p className={`training-status training-status--${saveStatus.type}`}>{saveStatus.message}</p> : null}
        </form>

        <div className="training-panel">
          <h2>Availability</h2>
          <form className="training-slot-form" onSubmit={handleAddSlot}>
            <label>
              Start
              <input type="datetime-local" value={slotStart} onChange={(e) => setSlotStart(e.target.value)} required />
            </label>
            <label>
              End
              <input type="datetime-local" value={slotEnd} onChange={(e) => setSlotEnd(e.target.value)} required />
            </label>
            <button className="button primary" type="submit" disabled={slotStatus.type === "loading"}>
              Add Slot
            </button>
          </form>
          {slotStatus.message ? <p className={`training-status training-status--${slotStatus.type}`}>{slotStatus.message}</p> : null}
          <div className="training-slot-list">
            {slots.length > 0 ? slots.map((slot) => (
              <div className="training-slot-row" key={slot.id}>
                <span>{formatDateTime(slot.starts_at)} - {formatDateTime(slot.ends_at)}</span>
                <strong>{slot.status}</strong>
                {slot.status === "available" ? (
                  <button className="button ghost" type="button" onClick={() => void cancelSlot(slot.id)}>
                    Cancel
                  </button>
                ) : null}
              </div>
            )) : <p className="muted">No upcoming availability yet.</p>}
          </div>
        </div>

        <div className="training-panel">
          <h2>Bookings</h2>
          <div className="training-booking-list">
            {bookings.length > 0 ? bookings.map((booking) => (
              <div className="training-booking-row" key={booking.id}>
                <div>
                  <strong>{booking.customer_name}</strong>
                  <span>{booking.customer_email}{booking.customer_phone ? ` • ${booking.customer_phone}` : ""}</span>
                  {booking.notes ? <p>{booking.notes}</p> : null}
                </div>
                <strong>{booking.status}</strong>
              </div>
            )) : <p className="muted">No booking requests yet.</p>}
          </div>
        </div>
      </Section>
    </PageShell>
  );
}
