"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";

import { AccessibilityControls } from "@/components/accessibility-controls";
import { HistoryBackButton } from "@/components/history-back-button";
import { canAccessPartnerPortal, formatApprovalStatusLabel } from "@/lib/event-approval";
import { createId } from "@/lib/create-id";
import { getEventProgramSlugOptions } from "@/lib/sports";
import { supabase } from "@/lib/supabase/client";
import type { Event, Profile, Sport } from "@/lib/supabase/types";

type AccessStatus = "loading" | "allowed" | "no-session" | "forbidden";
type SaveStatus = { type: "idle" | "loading" | "success" | "error"; message?: string };
const EVENT_IMAGE_BUCKET = "event-creation-uploads";

type PartnerEventFormState = {
  title: string;
  start_date: string;
  end_date: string;
  time_info: string;
  location: string;
  image_url: string;
  signup_mode: "registration" | "waitlist";
  registration_program_slug: string;
  sport_id: string;
  registration_enabled: boolean;
  waiver_url: string;
  registration_limit: string;
  payment_required: boolean;
  payment_amount: string;
};

const emptyForm = (): PartnerEventFormState => ({
  title: "",
  start_date: "",
  end_date: "",
  time_info: "",
  location: "",
  image_url: "",
  signup_mode: "registration",
  registration_program_slug: "",
  sport_id: "",
  registration_enabled: false,
  waiver_url: "",
  registration_limit: "",
  payment_required: false,
  payment_amount: "",
});

const mapEventToForm = (event: Event): PartnerEventFormState => ({
  title: event.title ?? "",
  start_date: event.start_date ?? "",
  end_date: event.end_date ?? "",
  time_info: event.time_info ?? "",
  location: event.location ?? "",
  image_url: event.image_url ?? "",
  signup_mode: event.signup_mode === "waitlist" ? "waitlist" : "registration",
  registration_program_slug: event.registration_program_slug ?? "",
  sport_id: event.sport_id ?? "",
  registration_enabled: Boolean(event.registration_enabled),
  waiver_url: event.waiver_url ?? "",
  registration_limit: event.registration_limit?.toString() ?? "",
  payment_required: Boolean(event.payment_required),
  payment_amount: event.payment_amount_cents ? (event.payment_amount_cents / 100).toFixed(2) : "",
});

const parseDateUTC = (value?: string | null) => {
  if (!value) return null;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null;
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day));
};

const formatDateRange = (start?: string | null, end?: string | null) => {
  if (!start && !end) return "Date TBD";
  const startDate = parseDateUTC(start);
  const endDate = parseDateUTC(end);
  const formatOptions: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };

  if (startDate && endDate) {
    if (startDate.getTime() === endDate.getTime()) {
      return startDate.toLocaleDateString(undefined, formatOptions);
    }
    return `${startDate.toLocaleDateString(undefined, formatOptions)} - ${endDate.toLocaleDateString(undefined, formatOptions)}`;
  }

  return startDate?.toLocaleDateString(undefined, formatOptions) ?? endDate?.toLocaleDateString(undefined, formatOptions) ?? "Date TBD";
};

export default function PartnerPage() {
  const [status, setStatus] = useState<AccessStatus>("loading");
  const [profile, setProfile] = useState<Pick<Profile, "id" | "name" | "role"> | null>(null);
  const [sports, setSports] = useState<Sport[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [form, setForm] = useState<PartnerEventFormState>(emptyForm());
  const [editForm, setEditForm] = useState<PartnerEventFormState>(emptyForm());
  const [formStatus, setFormStatus] = useState<SaveStatus>({ type: "idle" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadingCreateImage, setUploadingCreateImage] = useState(false);
  const [uploadingEditImageId, setUploadingEditImageId] = useState<string | null>(null);

  const fetchWithSession = useCallback(async (input: string, init?: RequestInit) => {
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }

    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) {
      throw new Error("You need to be signed in.");
    }

    return fetch(input, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        ...(init?.headers ?? {}),
      },
    });
  }, []);

  const loadPartnerEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const response = await fetchWithSession("/api/partner/events");
      const json = (await response.json().catch(() => null)) as { error?: string; events?: Event[] } | null;
      if (!response.ok) {
        throw new Error(json?.error ?? "Could not load your events.");
      }
      setEvents(json?.events ?? []);
    } catch (error) {
      setFormStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Could not load your events.",
      });
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, [fetchWithSession]);

  const loadSports = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("sports").select("id,title,section_headers").order("title", { ascending: true });
    if (error) {
      setSports([]);
      return;
    }
    setSports((data ?? []) as Sport[]);
  }, []);

  useEffect(() => {
    const loadPage = async () => {
      if (!supabase) {
        setStatus("forbidden");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        setStatus("no-session");
        return;
      }

      const { data: profileData } = await supabase.from("profiles").select("id,name,role").eq("id", userId).maybeSingle();

      setProfile((profileData as Pick<Profile, "id" | "name" | "role"> | null) ?? null);

      if (!canAccessPartnerPortal(profileData?.role)) {
        setStatus("forbidden");
        return;
      }

      setStatus("allowed");
      await loadSports();
      await loadPartnerEvents();
    };

    void loadPage();
  }, [loadPartnerEvents, loadSports]);

  const updateCreateForm = <K extends keyof PartnerEventFormState>(key: K, value: PartnerEventFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateCreateSportId = (sportId: string) => {
    setForm((prev) => {
      const nextSport = sports.find((sport) => sport.id === sportId) ?? null;
      const nextOptions = getEventProgramSlugOptions(nextSport);
      const currentValueStillValid = nextOptions.some((option) => option.value === prev.registration_program_slug);

      return {
        ...prev,
        sport_id: sportId,
        registration_program_slug: currentValueStillValid ? prev.registration_program_slug : (nextOptions[0]?.value ?? ""),
      };
    });
  };

  const updateEditForm = <K extends keyof PartnerEventFormState>(key: K, value: PartnerEventFormState[K]) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateEditSportId = (sportId: string) => {
    setEditForm((prev) => {
      const nextSport = sports.find((sport) => sport.id === sportId) ?? null;
      const nextOptions = getEventProgramSlugOptions(nextSport);
      const currentValueStillValid = nextOptions.some((option) => option.value === prev.registration_program_slug);

      return {
        ...prev,
        sport_id: sportId,
        registration_program_slug: currentValueStillValid ? prev.registration_program_slug : (nextOptions[0]?.value ?? ""),
      };
    });
  };

  const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

  const uploadManagedImage = async (folder: "events" | "events/waivers", file: File) => {
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const baseName = file.name.replace(new RegExp(`\\.${ext}$`, "i"), "");
    const path = `${folder}/${createId()}-${safeFileName(baseName)}.${ext}`;
    const { data, error } = await supabase.storage.from(EVENT_IMAGE_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (error) throw error;

    const finalPath = data?.path ?? path;
    const { data: publicUrlData } = supabase.storage.from(EVENT_IMAGE_BUCKET).getPublicUrl(finalPath);
    return publicUrlData.publicUrl;
  };

  const handleCreateImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormStatus({ type: "error", message: "Please select a valid image file." });
      return;
    }

    try {
      setUploadingCreateImage(true);
      const publicUrl = await uploadManagedImage("events", file);
      setForm((prev) => ({ ...prev, image_url: publicUrl }));
      setFormStatus({ type: "success", message: "Image uploaded. The generated URL was added to the field. Click Create Event to save it." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload image.";
      setFormStatus({ type: "error", message: `${message} (Bucket: ${EVENT_IMAGE_BUCKET})` });
    } finally {
      setUploadingCreateImage(false);
      e.target.value = "";
    }
  };

  const handleEditImageUpload = async (eventId: string, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormStatus({ type: "error", message: "Please select a valid image file." });
      return;
    }

    try {
      setUploadingEditImageId(eventId);
      const publicUrl = await uploadManagedImage("events", file);
      setEditForm((prev) => ({ ...prev, image_url: publicUrl }));
      setFormStatus({ type: "success", message: "Image uploaded. The generated URL was added to the field. Click Save Changes to update the event." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload image.";
      setFormStatus({ type: "error", message: `${message} (Bucket: ${EVENT_IMAGE_BUCKET})` });
    } finally {
      setUploadingEditImageId(null);
      e.target.value = "";
    }
  };

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    setFormStatus({ type: "loading" });

    try {
      const response = await fetchWithSession("/api/partner/events", {
        method: "POST",
        body: JSON.stringify(form),
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(json?.error ?? "Could not create the event.");
      }

      setFormStatus({ type: "success", message: "Event saved and sent to the owner approval queue." });
      setForm(emptyForm());
      await loadPartnerEvents();
    } catch (error) {
      setFormStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Could not create the event.",
      });
    }
  };

  const submitEdit = async (eventId: string) => {
    setSavingEditId(eventId);
    setFormStatus({ type: "idle" });

    try {
      const response = await fetchWithSession(`/api/partner/events/${eventId}`, {
        method: "PATCH",
        body: JSON.stringify(editForm),
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(json?.error ?? "Could not update the event.");
      }

      setEditingId(null);
      setFormStatus({ type: "success", message: "Changes saved and sent back for owner approval." });
      await loadPartnerEvents();
    } catch (error) {
      setFormStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Could not update the event.",
      });
    } finally {
      setSavingEditId(null);
    }
  };

  const deleteEvent = async (eventId: string, title: string) => {
    const confirmed = window.confirm(`Delete "${title}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingId(eventId);
    setFormStatus({ type: "idle" });

    try {
      const response = await fetchWithSession(`/api/partner/events/${eventId}`, {
        method: "DELETE",
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(json?.error ?? "Could not delete the event.");
      }

      if (editingId === eventId) {
        setEditingId(null);
      }
      setFormStatus({ type: "success", message: "Event deleted." });
      await loadPartnerEvents();
    } catch (error) {
      setFormStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Could not delete the event.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (status === "loading") {
    return (
      <div className="account-page">
        <AccessibilityControls />
        <div className="account-body shell">
          <p className="muted">Loading partner portal...</p>
        </div>
      </div>
    );
  }

  if (status === "no-session") {
    return (
      <div className="account-page">
        <AccessibilityControls />
        <div className="account-body shell">
          <p className="muted">Sign in to access the partner portal.</p>
        </div>
      </div>
    );
  }

  if (status === "forbidden") {
    return (
      <div className="account-page">
        <AccessibilityControls />
        <div className="account-body shell">
          <p className="muted">Your account does not have partner access.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="account-page">
      <AccessibilityControls />
      <div className="account-body shell">
        <HistoryBackButton label="← Back" fallbackHref="/account" />

        <section className="account-card">
          <h1>Partner Portal</h1>
          <p className="muted">
            Create your own events, edit only your events, and send every version through owner approval before it goes live.
          </p>
          {profile?.name ? <p className="muted">Signed in as {profile.name}.</p> : null}
          <p className="form-help muted">
            If you edit an already approved partner event, it moves back into pending approval until an owner signs off again.
          </p>
        </section>

        <section className="account-card">
          <div className="account-card__header">
            <div>
              <h2>Create Event</h2>
              <p className="muted">New partner events are saved with `host_type = partner` and start in owner review.</p>
            </div>
          </div>
          <form className="register-form" onSubmit={submitCreate}>
            <PartnerEventFields
              idPrefix="create"
              form={form}
              sports={sports}
              update={updateCreateForm}
              updateSportId={updateCreateSportId}
              uploadingImage={uploadingCreateImage}
              onImageUpload={handleCreateImageUpload}
            />
            <div className="cta-row">
              <button className="button primary" type="submit" disabled={formStatus.type === "loading"}>
                {formStatus.type === "loading" ? "Saving..." : "Create Event"}
              </button>
            </div>
          </form>
          {formStatus.message ? (
            <p className={`form-help ${formStatus.type === "error" ? "error" : formStatus.type === "success" ? "success" : "muted"}`}>
              {formStatus.message}
            </p>
          ) : null}
        </section>

        <section className="account-card">
          <div className="account-card__header">
            <div>
              <h2>Your Events</h2>
              <p className="muted">Only events created under your partner account appear here.</p>
            </div>
            <button className="button ghost" type="button" onClick={() => void loadPartnerEvents()} disabled={loadingEvents}>
              {loadingEvents ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          {loadingEvents ? <p className="muted">Loading your events...</p> : null}
          {!loadingEvents && events.length === 0 ? (
            <p className="muted">You have not created any partner events yet.</p>
          ) : (
            <div className="event-list admin-existing-events-list">
              {events.map((event) => (
                <article key={event.id} className="event-card-simple">
                  <div className="event-card__header">
                    <h3>{event.title}</h3>
                  </div>
                  <div className="event-card__meta">
                    <p className="muted">Approval: {formatApprovalStatusLabel(event.approval_status)}</p>
                    <p className="muted">Date: {formatDateRange(event.start_date, event.end_date)}</p>
                    {event.time_info ? <p className="muted">Time: {event.time_info}</p> : null}
                    {event.location ? <p className="muted">Location: {event.location}</p> : null}
                    {event.registration_program_slug ? <p className="muted">Event type: {event.registration_program_slug}</p> : null}
                    {event.sport_id ? <p className="muted">Sport: {sports.find((sport) => sport.id === event.sport_id)?.title ?? event.sport_id}</p> : null}
                    <p className="muted">
                      Signup mode: {event.signup_mode === "waitlist" ? "Waitlist / interest" : "Registration"}
                    </p>
                    <p className="muted">Signups: {event.registration_enabled ? "Open" : "Closed"}</p>
                    {event.approval_notes ? <p className="muted">Owner notes: {event.approval_notes}</p> : null}
                  </div>
                  {event.description ? <p className="muted">{event.description}</p> : null}
                  <div className="cta-row">
                    <button
                      className="button ghost"
                      type="button"
                      onClick={() => {
                        setEditingId(event.id);
                        setEditForm(mapEventToForm(event));
                        setFormStatus({ type: "idle" });
                      }}
                      disabled={savingEditId === event.id}
                    >
                      {editingId === event.id ? "Editing" : "Edit"}
                    </button>
                    <button
                      className="button ghost"
                      type="button"
                      onClick={() => void deleteEvent(event.id, event.title)}
                      disabled={deletingId === event.id}
                    >
                      {deletingId === event.id ? "Deleting..." : "Delete"}
                    </button>
                    {event.approval_status === "approved" ? (
                      <Link className="button ghost" href={`/events?eventId=${event.id}`}>
                        View Live Listing
                      </Link>
                    ) : null}
                  </div>
                  {editingId === event.id ? (
                    <div className="register-form" style={{ marginTop: 12 }}>
                      <PartnerEventFields
                        idPrefix={`edit-${event.id}`}
                        form={editForm}
                        sports={sports}
                        update={updateEditForm}
                        updateSportId={updateEditSportId}
                        uploadingImage={uploadingEditImageId === event.id}
                        onImageUpload={(e) => void handleEditImageUpload(event.id, e)}
                      />
                      <div className="cta-row">
                        <button
                          className="button primary"
                          type="button"
                          onClick={() => void submitEdit(event.id)}
                          disabled={savingEditId === event.id}
                        >
                          {savingEditId === event.id ? "Saving..." : "Save Changes"}
                        </button>
                        <button className="button ghost" type="button" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function PartnerEventFields({
  idPrefix,
  form,
  sports,
  update,
  updateSportId,
  uploadingImage,
  onImageUpload,
}: {
  idPrefix: string;
  form: PartnerEventFormState;
  sports: Sport[];
  update: <K extends keyof PartnerEventFormState>(key: K, value: PartnerEventFormState[K]) => void;
  updateSportId: (sportId: string) => void;
  uploadingImage: boolean;
  onImageUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <>
      <div className="register-form-grid">
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-title`}>Event Name *</label>
          <input
            id={`${idPrefix}-partner-title`}
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            required
          />
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-start`}>Start date</label>
          <input
            id={`${idPrefix}-partner-start`}
            type="date"
            value={form.start_date}
            onChange={(e) => update("start_date", e.target.value)}
          />
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-end`}>End date</label>
          <input
            id={`${idPrefix}-partner-end`}
            type="date"
            value={form.end_date}
            onChange={(e) => update("end_date", e.target.value)}
          />
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-time`}>Time info</label>
          <input
            id={`${idPrefix}-partner-time`}
            value={form.time_info}
            onChange={(e) => update("time_info", e.target.value)}
            placeholder="8:00 AM tip-off"
          />
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-location`}>Location</label>
          <input
            id={`${idPrefix}-partner-location`}
            value={form.location}
            onChange={(e) => update("location", e.target.value)}
          />
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-signup-mode`}>Signup mode</label>
          <select
            id={`${idPrefix}-partner-signup-mode`}
            value={form.signup_mode}
            onChange={(e) => update("signup_mode", e.target.value as "registration" | "waitlist")}
          >
            <option value="registration">Registration</option>
            <option value="waitlist">Waitlist / interest</option>
          </select>
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-sport`}>Sport page</label>
          <select
            id={`${idPrefix}-partner-sport`}
            value={form.sport_id}
            onChange={(e) => updateSportId(e.target.value)}
          >
            <option value="">Not linked to a sport page</option>
            {sports.map((sport) => (
              <option key={sport.id} value={sport.id}>
                {sport.title}
              </option>
            ))}
          </select>
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-program`}>Event type</label>
          <select
            id={`${idPrefix}-partner-program`}
            value={form.registration_program_slug}
            onChange={(e) => update("registration_program_slug", e.target.value)}
            disabled={!form.sport_id}
          >
            <option value="">{form.sport_id ? "Select an event type" : "Select a sport page first"}</option>
            {getEventProgramSlugOptions(sports.find((sport) => sport.id === form.sport_id) ?? null).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-limit`}>Registration limit</label>
          <input
            id={`${idPrefix}-partner-limit`}
            type="number"
            min="1"
            value={form.registration_limit}
            onChange={(e) => update("registration_limit", e.target.value)}
            disabled={form.signup_mode === "waitlist"}
          />
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-payment`}>Payment amount (USD)</label>
          <input
            id={`${idPrefix}-partner-payment`}
            type="number"
            min="0.01"
            step="0.01"
            value={form.payment_amount}
            onChange={(e) => update("payment_amount", e.target.value)}
            disabled={form.signup_mode === "waitlist" || !form.payment_required}
          />
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-image`}>Event Card Image</label>
          <input
            id={`${idPrefix}-partner-image`}
            value={form.image_url}
            onChange={(e) => update("image_url", e.target.value)}
          />
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label className="button ghost" htmlFor={`${idPrefix}-partner-image-upload`} style={{ padding: "0.45rem 0.75rem" }}>
              {uploadingImage ? "Uploading..." : "Upload an image manually"}
            </label>
            <input
              id={`${idPrefix}-partner-image-upload`}
              type="file"
              accept="image/*"
              onChange={onImageUpload}
              disabled={uploadingImage}
              style={{ display: "none" }}
            />
          </div>
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-waiver`}>Waiver URL</label>
          <input
            id={`${idPrefix}-partner-waiver`}
            value={form.waiver_url}
            onChange={(e) => update("waiver_url", e.target.value)}
            disabled={form.signup_mode === "waitlist"}
          />
        </div>
      </div>
      <div className="form-control checkbox-control" style={{ justifySelf: "start", textAlign: "left", width: "fit-content" }}>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.registration_enabled}
            onChange={(e) => update("registration_enabled", e.target.checked)}
          />
          <span>Accept signups</span>
        </label>
      </div>
      <div className="form-control checkbox-control" style={{ justifySelf: "start", textAlign: "left", width: "fit-content" }}>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.payment_required}
            onChange={(e) => update("payment_required", e.target.checked)}
            disabled={form.signup_mode === "waitlist"}
          />
          <span>Require payment before registration is created</span>
        </label>
      </div>
    </>
  );
}
