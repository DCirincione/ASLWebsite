"use client";

import Link from "next/link";
import TrainerDocuments from "./documents";
import AvailabilityCalendar from "./availability-calendar";
import { TrainerCard } from "../trainers/network";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";

import "./training.css";
import "../trainers/network.css";

import { HistoryBackButton } from "@/components/history-back-button";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { easternSessionTime } from "@/lib/trainer-time";
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

type AvailabilityTimeDraft = {
  startTime: string;
  sessionIndex: string;
};

type TrainerProfileForm = {
  booking_mode: "network" | "referral";
  level: string;
  background: string;
  interview_quote: string;
  sports: string;
  locations: string;
  travel_areas: string;
  travel_miles: string;
  booking_url: string;
  referral_code: string;
  referral_discount: string;
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
  booking_mode: "network", level: "", background: "", interview_quote: "", sports: "", locations: "", travel_areas: "", travel_miles: "", booking_url: "", referral_code: "", referral_discount: "",
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
    booking_mode: profile.booking_mode ?? "network",
    level: profile.level ?? "", background: profile.background ?? "", interview_quote: profile.interview_quote ?? "",
    sports: (profile.sports ?? []).join(", "), locations: (profile.locations ?? []).join(", "), travel_areas: profile.travel_areas ?? "", travel_miles: String(profile.travel_miles ?? ""), booking_url: profile.booking_url ?? "", referral_code: profile.referral_code ?? "", referral_discount: profile.referral_discount ?? "",
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

const parseDurationMinutes = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const hourMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  const minuteMatch = normalized.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/);
  const plainNumberMatch = normalized.match(/^(\d+)$/);

  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : plainNumberMatch ? Number(plainNumberMatch[1]) : 0;
  const total = Math.round(hours * 60 + minutes);

  return Number.isFinite(total) && total > 0 ? total : null;
};

const addMinutesToTimeInput = (timeValue: string, minutesToAdd: number) => {
  const [hoursValue, minutesValue] = timeValue.split(":").map(Number);
  if (
    !Number.isInteger(hoursValue) ||
    !Number.isInteger(minutesValue) ||
    hoursValue < 0 ||
    hoursValue > 23 ||
    minutesValue < 0 ||
    minutesValue > 59 ||
    !Number.isFinite(minutesToAdd)
  ) {
    return "";
  }

  const nextTotalMinutes = (hoursValue * 60 + minutesValue + minutesToAdd) % (24 * 60);
  const nextHours = Math.floor(nextTotalMinutes / 60).toString().padStart(2, "0");
  const nextMinutes = (nextTotalMinutes % 60).toString().padStart(2, "0");
  return `${nextHours}:${nextMinutes}`;
};

function PortalShell({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  return embedded ? <div className="trainer-portal-embedded">{children}</div> : <PageShell>{children}</PageShell>;
}

export default function TrainerPortal({ embedded = false }: { embedded?: boolean }) {
  const [accessStatus, setAccessStatus] = useState<"loading" | "allowed" | "no-session" | "forbidden">("loading");
  const [isAdmin, setIsAdmin] = useState(false);
  const [earningsCutoff] = useState(() => Date.now() - 60 * 86400000);
  const [hubTab, setHubTab] = useState("Profile");
  const [profiles, setProfiles] = useState<Array<{id:string;display_name:string}>>([]);
  const [earnings, setEarnings] = useState<Array<{id:string;session_name:string;session_cents:number;commission_cents:number;trainer_cents:number;paid_at:string|null;status:string;created_at:string;square_payment_link_id:string|null}>>([]);
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [slotLocation, setSlotLocation] = useState("");
  const [venueFee, setVenueFee] = useState("0");
  const [form, setForm] = useState<TrainerProfileForm>(() => emptyForm());
  const [slots, setSlots] = useState<TrainerAvailabilitySlot[]>([]);
  const [bookings, setBookings] = useState<TrainerBooking[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ type: "idle" });
  const [slotStatus, setSlotStatus] = useState<SaveStatus>({ type: "idle" });
  const [uploadStatus, setUploadStatus] = useState<SaveStatus>({ type: "idle" });
  const [slotDate, setSlotDate] = useState("");
  const [slotStartTimes, setSlotStartTimes] = useState<AvailabilityTimeDraft[]>([
    { startTime: "", sessionIndex: "0" },
  ]);

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

    const trainerId = new URLSearchParams(window.location.search).get("trainerId");
    const response = await fetchWithSession(`/api/trainer/profile${trainerId ? `?trainerId=${encodeURIComponent(trainerId)}` : ""}`);
    const json = (await response.json()) as {
      profile?: TrainerProfile | null;
      slots?: TrainerAvailabilitySlot[];
      bookings?: TrainerBooking[];
      profiles?: Array<{id:string;display_name:string}>;
      earnings?: Array<{id:string;session_name:string;session_cents:number;commission_cents:number;trainer_cents:number;paid_at:string|null;status:string;created_at:string;square_payment_link_id:string|null}>;
      error?: string;
    };
    if (!response.ok) throw new Error(json.error ?? "Could not load trainer profile.");
    setProfiles(json.profiles ?? []);
    setEarnings(json.earnings ?? []);

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

  const updateSlotStartTime = (index: number, value: string) => {
    setSlotStartTimes((current) =>
      current.map((entry, timeIndex) => (timeIndex === index ? { ...entry, startTime: value } : entry)),
    );
  };

  const updateSlotSessionIndex = (index: number, value: string) => {
    setSlotStartTimes((current) =>
      current.map((entry, timeIndex) => (timeIndex === index ? { ...entry, sessionIndex: value } : entry)),
    );
  };

  const addSlotStartTime = () => {
    setSlotStartTimes((current) => {
      const previousEntry = [...current].reverse().find((entry) => entry.startTime.trim()) ?? current[current.length - 1];
      const nextSessionIndex = previousEntry?.sessionIndex ?? "0";
      const sessionIndex = Number(nextSessionIndex);
      const previousSession = sessionOptions[sessionIndex] ?? form.session_options[sessionIndex] ?? null;
      const durationMinutes = previousSession?.duration ? parseDurationMinutes(previousSession.duration) : null;

      return [
        ...current,
        {
          startTime: previousEntry?.startTime && durationMinutes
            ? addMinutesToTimeInput(previousEntry.startTime, durationMinutes)
            : "",
          sessionIndex: nextSessionIndex,
        },
      ];
    });
  };

  const removeSlotStartTime = (index: number) => {
    setSlotStartTimes((current) => current.filter((_, timeIndex) => timeIndex !== index));
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
          booking_mode: form.booking_mode, level: form.level, background: form.background, interview_quote: form.interview_quote,
          sports: form.sports.split(",").map(v => v.trim()).filter(Boolean), locations: form.locations.split(",").map(v => v.trim()).filter(Boolean),
          travel_areas: form.travel_areas, travel_miles: form.travel_miles, booking_url: form.booking_url, referral_code: form.referral_code, referral_discount: form.referral_discount,
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
      const timeEntries = slotStartTimes
        .map((entry) => ({
          startTime: entry.startTime.trim(),
          sessionIndex: entry.sessionIndex,
          session: sessionOptions[Number(entry.sessionIndex)] ?? null,
        }))
        .filter((entry) => entry.startTime);
      const uniqueTimeEntries = Array.from(
        new Map(timeEntries.map((entry) => [`${entry.startTime}:${entry.sessionIndex}`, entry])).values(),
      );

      if (!slotDate || uniqueTimeEntries.length === 0) {
        setSlotStatus({ type: "error", message: "Choose a date and at least one start time." });
        return;
      }

      if (uniqueTimeEntries.some((entry) => !entry.session || !parseDurationMinutes(entry.session.duration))) {
        setSlotStatus({ type: "error", message: "Each start time needs a session option with a duration like 60 min or 1 hour." });
        return;
      }

      const createdSlots: TrainerAvailabilitySlot[] = [];
      for (let week = 0; week < repeatWeeks; week++) {
      for (const entry of uniqueTimeEntries) {
        const durationMinutes = parseDurationMinutes(entry.session!.duration);
        if (!durationMinutes) {
          throw new Error("Each start time needs a valid session duration.");
        }

        const repeatDate = new Date(`${slotDate}T12:00:00Z`);
        repeatDate.setUTCDate(repeatDate.getUTCDate() + week * 7);
        const startsAt = easternSessionTime(repeatDate.toISOString().slice(0, 10), entry.startTime);
        if (Number.isNaN(startsAt.getTime())) {
          throw new Error("One of the start times is invalid.");
        }
        const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

        const response = await fetchWithSession("/api/trainer/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: slotLocation || form.location,
            venueFeeCents: isAdmin ? Math.round(Number(venueFee) * 100) : 0,
            trainerId: form.id,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
          }),
        });
        const json = (await response.json()) as { slot?: TrainerAvailabilitySlot; error?: string };
        if (!response.ok || !json.slot) throw new Error(json.error ?? "Could not add availability.");
        createdSlots.push(json.slot);
      }
      }

      setSlots((current) => [...current, ...createdSlots].sort((left, right) => left.starts_at.localeCompare(right.starts_at)));
      setSlotDate("");
      setSlotStartTimes([{ startTime: "", sessionIndex: "0" }]);
      setSlotStatus({ type: "success", message: `${createdSlots.length} availability slot${createdSlots.length === 1 ? "" : "s"} added.` });
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
      <PortalShell embedded={embedded}>
        <Section id="training" title="Training Portal" headingLevel="h1">
          <p className="muted">Loading training portal...</p>
        </Section>
      </PortalShell>
    );
  }

  if (accessStatus === "no-session" || accessStatus === "forbidden") {
    return (
      <PortalShell embedded={embedded}>
        <Section id="training" title="Training Portal" headingLevel="h1">
          <p className="muted">
            {accessStatus === "no-session"
              ? "Sign in with a trainer, admin, or owner account to access this page."
              : "This page is available to trainers, admins, and owners."}
          </p>
        </Section>
      </PortalShell>
    );
  }

  return (
    <PortalShell embedded={embedded}>
      <div className="training-page__back">
        <HistoryBackButton label="Back" fallbackHref="/trainers" />
      </div>
      <Section
        id="training"
        className="training-page"
        eyebrow="Trainer Portal"
        title="Your Trainer Hub"
        description="Your profile, schedule, sessions and earnings—all in one place."
        headingLevel="h1"
      >
        {isAdmin && <div className="training-panel"><div><Link className="button primary" href="/training/applications">Review trainer applications <span aria-hidden="true">→</span></Link></div><label>Manage a trainer <select value={form.id} onChange={e => { window.location.assign(`/training?trainerId=${encodeURIComponent(e.target.value)}`); }}><option value="">Choose trainer</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label></div>}
        <div className="training-hub-layout"><nav className="training-hub-nav" aria-label="Trainer Hub">{["Profile", ...(form.booking_mode !== "referral" ? ["Availability", "Sessions", "Earnings"] : []), "Documents"].map(tab => <button key={tab} className="button ghost" aria-current={hubTab === tab ? "page" : undefined} onClick={() => setHubTab(tab)}>{tab}</button>)}<Link href="/trainers">← Training Network</Link></nav><div>
        <form hidden={hubTab !== "Profile"} className="training-manager" onSubmit={handleSaveProfile}>
          <div className="training-panel">
            <div className="training-panel__header">
              <h2>Profile Content</h2>
              {publicProfileHref ? <Link className="button ghost" href={publicProfileHref}>View Public Page</Link> : null}
            </div>
            <div className="training-form-grid">
              <label>Booking method<select value={form.booking_mode} onChange={e => updateForm("booking_mode", e.target.value as "network" | "referral")}><option value="network">Book through Aldrich</option><option value="referral">Referral partner</option></select></label>
              <label>Approved level<select disabled={!isAdmin} value={form.level} onChange={e => updateForm("level", e.target.value)}><option value="">Awaiting review</option>{["Rising", "Collegiate", "Elite"].map(l => <option key={l}>{l}</option>)}</select></label>
              <label className="training-form-grid__full">Interview quote (set by Aldrich)<textarea disabled={!isAdmin} value={form.interview_quote} onChange={e => updateForm("interview_quote", e.target.value)} /></label>
              <label>Playing background<input value={form.background} onChange={e => updateForm("background", e.target.value)} /></label>
              <label>All sports (comma-separated)<input value={form.sports} onChange={e => updateForm("sports", e.target.value)} /></label>
              <label>All locations (comma-separated)<input value={form.locations} onChange={e => updateForm("locations", e.target.value)} /></label>
              <label>Travel areas<input value={form.travel_areas} onChange={e => updateForm("travel_areas", e.target.value)} /></label>
              <label>Travel distance (miles)<input type="number" min="0" max="200" value={form.travel_miles} onChange={e => updateForm("travel_miles", e.target.value)} /></label>
              {form.booking_mode === "referral" && <><label>Booking website<input type="url" required value={form.booking_url} onChange={e => updateForm("booking_url", e.target.value)} /></label><label>Aldrich referral code<input disabled={!isAdmin} value={form.referral_code} onChange={e => updateForm("referral_code", e.target.value)} /></label><label>Discount for Aldrich families<input value={form.referral_discount} onChange={e => updateForm("referral_discount", e.target.value)} /></label></>}
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

          <div className="training-panel" hidden={form.booking_mode === "referral"}>
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

          <div className="training-panel"><h2>Live profile preview</h2><div className="training-network" style={{ maxWidth: 460 }}><TrainerCard trainer={{ id: form.id, userId: "", slug: form.slug, name: form.display_name || "Your name", headline: form.headline, sport: form.sport, location: form.location, bio: form.bio, specialties: form.specialtiesText.split(",").map(s => s.trim()).filter(Boolean), sessionTypes: sessionOptions, headshotUrl: form.headshot_url || "/ASLLogo.png", flyerUrl: form.flyer_url, status: form.status, availability: [], network: { booking_mode: form.booking_mode, level: (["Rising", "Collegiate", "Elite"].includes(form.level) ? form.level : null) as TrainerProfile["level"], background: form.background, interview_quote: form.interview_quote, sports: form.sports.split(",").map(s => s.trim()).filter(Boolean), locations: form.locations.split(",").map(s => s.trim()).filter(Boolean), travel_areas: form.travel_areas, travel_miles: Number(form.travel_miles) || null, booking_url: form.booking_url, referral_code: form.referral_code, referral_discount: form.referral_discount } }} onBook={() => { if (publicProfileHref) window.location.assign(publicProfileHref); }} /></div></div>
          <button className="button primary" type="submit" disabled={saveStatus.type === "loading"}>
            {saveStatus.type === "loading" ? "Saving..." : "Save Trainer Profile"}
          </button>
          {saveStatus.message ? <p className={`training-status training-status--${saveStatus.type}`}>{saveStatus.message}</p> : null}
        </form>

        <div className="training-panel" hidden={hubTab !== "Availability"}>
          <h2>Availability</h2>
          <form className="training-slot-form" onSubmit={handleAddSlot}>
            <label>Location<input value={slotLocation} placeholder={form.location} onChange={e => setSlotLocation(e.target.value)} /></label>
            {isAdmin && <label>Venue fee per session ($)<input type="number" min="0" step="0.01" value={venueFee} onChange={e => setVenueFee(e.target.value)} /></label>}
            <label>
              Date (Eastern time)
              <input type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} required />
            </label>
            <label>Repeat weekly<select value={repeatWeeks} onChange={e => setRepeatWeeks(Number(e.target.value))}>{[1, 2, 4, 8, 12].map(n => <option key={n} value={n}>{n === 1 ? "One time only" : `For ${n} weeks`}</option>)}</select></label>
            <div className="training-time-list">
              <span className="training-time-list__label">Start times and session lengths</span>
              {slotStartTimes.map((entry, index) => (
                <div className="training-time-row" key={index}>
                  <input
                    type="time"
                    value={entry.startTime}
                    onChange={(e) => updateSlotStartTime(index, e.target.value)}
                    required={index === 0}
                  />
                  <select
                    value={entry.sessionIndex}
                    onChange={(e) => updateSlotSessionIndex(index, e.target.value)}
                    disabled={sessionOptions.length === 0}
                    required
                  >
                    {sessionOptions.length > 0 ? (
                      sessionOptions.map((option, optionIndex) => (
                        <option key={`${option.name}-${optionIndex}`} value={optionIndex}>
                          {option.name} {option.duration ? `- ${option.duration}` : ""}
                        </option>
                      ))
                    ) : (
                      <option value="0">Add a session option first</option>
                    )}
                  </select>
                  {slotStartTimes.length > 1 ? (
                    <button className="button ghost" type="button" onClick={() => removeSlotStartTime(index)}>
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
              <button className="button ghost" type="button" onClick={addSlotStartTime}>
                Add Another Time
              </button>
            </div>
            <button className="button primary" type="submit" disabled={slotStatus.type === "loading"}>
              Add Slot
            </button>
          </form>
          {slotStatus.message ? <p className={`training-status training-status--${slotStatus.type}`}>{slotStatus.message}</p> : null}
          {hubTab === "Availability" && <AvailabilityCalendar key={form.id} slots={slots} onCancel={cancelSlot} />}
        </div>

        <div className="training-panel" hidden={hubTab !== "Sessions"}>
          <h2>Sessions</h2>
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
        <div className="training-panel" hidden={hubTab !== "Earnings"}><h2>Earnings</h2><p>Paid session earnings: ${(earnings.filter(e => e.status === "paid").reduce((sum, e) => sum + e.trainer_cents, 0) / 100).toFixed(2)}</p><p>Paid sessions in the last 60 days: {earnings.filter(e => e.status === "paid" && e.paid_at && new Date(e.paid_at).getTime() >= earningsCutoff).length} / 20 to qualify for the 12% rate.</p><p>Session earnings are recorded here. Bank payouts are arranged by Aldrich.</p>{earnings.map(e => <div className="training-booking-row" key={e.id}><span>{e.session_name} · {e.status}</span><span>Your share: ${(e.trainer_cents / 100).toFixed(2)}</span></div>)}{!earnings.length && <p>No paid sessions yet.</p>}</div>
        {hubTab === "Documents" && <TrainerDocuments trainerId={form.id} />}
        </div></div>
      </Section>
    </PortalShell>
  );
}
