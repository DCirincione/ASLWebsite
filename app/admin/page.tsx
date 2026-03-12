"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { AccessibilityControls } from "@/components/accessibility-controls";
import { supabase } from "@/lib/supabase/client";
import type { Event } from "@/lib/supabase/types";

type AccessStatus = "loading" | "allowed" | "no-session" | "forbidden";
type FormStatus = { type: "idle" | "loading" | "success" | "error"; message?: string };
type AdminModule = "none" | "events" | "sports" | "registrations" | "users" | "flyers" | "settings";
type HostType = NonNullable<Event["host_type"]>;
type EventFormState = {
  title: string;
  start_date: string;
  end_date: string;
  time_info: string;
  location: string;
  description: string;
  host_type: HostType;
  image_url: string;
  registration_program_slug: string;
};

export default function AdminPage() {
  const [status, setStatus] = useState<AccessStatus>("loading");
  const [activeModule, setActiveModule] = useState<AdminModule>("none");
  const [events, setEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<FormStatus>({ type: "idle" });
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [form, setForm] = useState<EventFormState>({
    title: "",
    start_date: "",
    end_date: "",
    time_info: "",
    location: "",
    description: "",
    host_type: "aldrich",
    image_url: "",
    registration_program_slug: "",
  });
  const [editForm, setEditForm] = useState<EventFormState>({
    title: "",
    start_date: "",
    end_date: "",
    time_info: "",
    location: "",
    description: "",
    host_type: "aldrich",
    image_url: "",
    registration_program_slug: "",
  });
  const adminModules: Array<{
    id: Exclude<AdminModule, "none">;
    title: string;
    description: string;
    enabled: boolean;
  }> = [
    {
      id: "events",
      title: "Events",
      description: "Create, edit, and remove site events.",
      enabled: true,
    },
    {
      id: "sports",
      title: "Sports",
      description: "Manage sports pages and configurations.",
      enabled: false,
    },
    {
      id: "registrations",
      title: "Registrations",
      description: "Review and manage event signups.",
      enabled: false,
    },
    {
      id: "users",
      title: "Users",
      description: "Manage user profiles and roles.",
      enabled: false,
    },
    {
      id: "flyers",
      title: "Flyers",
      description: "Upload and manage event flyers.",
      enabled: false,
    },
    {
      id: "settings",
      title: "Settings",
      description: "Global admin and site settings.",
      enabled: false,
    },
  ];

  const loadEvents = async () => {
    if (!supabase) return;
    setLoadingEvents(true);
    setEventsError(null);
    const { data, error } = await supabase
      .from("events")
      .select("id,title,start_date,end_date,time_info,location,description,host_type,image_url,registration_program_slug")
      .order("start_date", { ascending: true, nullsFirst: false });

    if (!error && data) {
      setEvents(data as Event[]);
    } else {
      setEvents([]);
      setEventsError(error?.message ?? "Could not load events.");
    }
    setLoadingEvents(false);
  };

  useEffect(() => {
    const loadAccess = async () => {
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

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      const role = profile?.role ?? null;
      if (role === "admin" || role === "owner") {
        setStatus("allowed");
        return;
      }

      setStatus("forbidden");
    };

    void loadAccess();
  }, []);

  const update = <K extends keyof EventFormState>(key: K, value: EventFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm({
      title: "",
      start_date: "",
      end_date: "",
      time_info: "",
      location: "",
      description: "",
      host_type: "aldrich",
      image_url: "",
      registration_program_slug: "",
    });
  };

  const startEditing = (event: Event) => {
    setEditingId(event.id);
    setEditForm({
      title: event.title ?? "",
      start_date: event.start_date ?? "",
      end_date: event.end_date ?? "",
      time_info: event.time_info ?? "",
      location: event.location ?? "",
      description: event.description ?? "",
      host_type: event.host_type ?? "aldrich",
      image_url: event.image_url ?? "",
      registration_program_slug: event.registration_program_slug ?? "",
    });
    setFormStatus({ type: "idle" });
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const updateEdit = <K extends keyof EventFormState>(key: K, value: EventFormState[K]) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreateEvent = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      setFormStatus({ type: "error", message: "Supabase is not configured." });
      return;
    }

    if (!form.title.trim()) {
      setFormStatus({ type: "error", message: "Title is required." });
      return;
    }

    setFormStatus({ type: "loading" });
    const payload = {
      title: form.title.trim(),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      time_info: form.time_info.trim() || null,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
      host_type: form.host_type || null,
      image_url: form.image_url.trim() || null,
      registration_program_slug: form.registration_program_slug.trim() || null,
    };

    const { error } = await supabase.from("events").insert(payload);
    if (error) {
      setFormStatus({ type: "error", message: error.message });
      return;
    }

    setFormStatus({ type: "success", message: "Event created." });
    resetForm();
    await loadEvents();
  };

  const handleDeleteEvent = async (eventId: string, title: string) => {
    if (!supabase) return;
    const confirmed = window.confirm(`Delete "${title}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingId(eventId);
    const { error } = await supabase.from("events").delete().eq("id", eventId);
    setDeletingId(null);

    if (error) {
      setFormStatus({ type: "error", message: `Could not delete event: ${error.message}` });
      return;
    }

    setFormStatus({ type: "success", message: "Event deleted." });
    await loadEvents();
  };

  const handleSaveEdit = async (eventId: string) => {
    if (!supabase) return;
    if (!editForm.title.trim()) {
      setFormStatus({ type: "error", message: "Title is required." });
      return;
    }

    setSavingEditId(eventId);
    const payload = {
      title: editForm.title.trim(),
      start_date: editForm.start_date || null,
      end_date: editForm.end_date || null,
      time_info: editForm.time_info.trim() || null,
      location: editForm.location.trim() || null,
      description: editForm.description.trim() || null,
      host_type: editForm.host_type || null,
      image_url: editForm.image_url.trim() || null,
      registration_program_slug: editForm.registration_program_slug.trim() || null,
    };

    const { error } = await supabase.from("events").update(payload).eq("id", eventId);
    setSavingEditId(null);

    if (error) {
      setFormStatus({ type: "error", message: `Could not update event: ${error.message}` });
      return;
    }

    setFormStatus({ type: "success", message: "Event updated." });
    setEditingId(null);
    await loadEvents();
  };

  const dateLabel = (start?: string | null, end?: string | null) => {
    if (!start && !end) return "Date TBD";
    if (start && end && start !== end) return `${start} to ${end}`;
    return start || end || "Date TBD";
  };

  const openModule = (module: Exclude<AdminModule, "none">, enabled: boolean) => {
    if (!enabled) return;
    setActiveModule(module);
    if (module === "events") {
      void loadEvents();
    }
  };

  return (
    <div className="account-page">
      <AccessibilityControls />
      <div className="account-body shell">
        <Link className="button ghost" href="/">
          ← Back
        </Link>
        {status === "loading" ? <p className="muted">Loading admin dashboard...</p> : null}
        {status === "no-session" ? (
          <p className="muted">
            Sign in to access the admin dashboard. <Link href="/account">Go to account</Link>.
          </p>
        ) : null}
        {status === "forbidden" ? (
          <p className="muted">
            You do not have access to this page.
          </p>
        ) : null}
        {status === "allowed" ? (
          <>
            <section className="account-card">
              <h1>Admin Dashboard</h1>
              <p className="muted">Choose an area to manage.</p>
              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                  maxWidth: 980,
                }}
              >
                {adminModules.map((module) => (
                  <button
                    key={module.id}
                    className={`button ${activeModule === module.id ? "primary" : "ghost"}`}
                    type="button"
                    onClick={() => openModule(module.id, module.enabled)}
                    disabled={!module.enabled}
                    style={{
                      textAlign: "left",
                      height: "100%",
                      minHeight: 150,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: 8,
                      opacity: module.enabled ? 1 : 0.7,
                    }}
                  >
                    <span style={{ fontSize: "1rem", fontWeight: 700 }}>{module.title}</span>
                    <span style={{ fontSize: "0.9rem", lineHeight: 1.35 }}>{module.description}</span>
                    {!module.enabled ? <span style={{ fontSize: "0.8rem" }}>Coming soon</span> : null}
                  </button>
                ))}
              </div>
            </section>

            {activeModule === "events" ? (
              <>
            <section className="account-card">
              <h2>Events Manager</h2>
              <p className="muted">Add new events or update/remove existing ones.</p>
            </section>
            <section className="account-card">
              <h2>Create Event</h2>
              <form className="register-form" onSubmit={handleCreateEvent}>
                <div className="register-form-grid">
                  <div className="form-control">
                    <label htmlFor="event-title">Title *</label>
                    <input
                      id="event-title"
                      value={form.title}
                      onChange={(e) => update("title", e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-control">
                    <label htmlFor="event-start">Start date</label>
                    <input
                      id="event-start"
                      type="date"
                      value={form.start_date}
                      onChange={(e) => update("start_date", e.target.value)}
                    />
                  </div>
                  <div className="form-control">
                    <label htmlFor="event-end">End date</label>
                    <input
                      id="event-end"
                      type="date"
                      value={form.end_date}
                      onChange={(e) => update("end_date", e.target.value)}
                    />
                  </div>
                  <div className="form-control">
                    <label htmlFor="event-time">Time info</label>
                    <input
                      id="event-time"
                      value={form.time_info}
                      onChange={(e) => update("time_info", e.target.value)}
                      placeholder="8:00 AM tip-off"
                    />
                  </div>
                  <div className="form-control">
                    <label htmlFor="event-location">Location</label>
                    <input
                      id="event-location"
                      value={form.location}
                      onChange={(e) => update("location", e.target.value)}
                    />
                  </div>
                  <div className="form-control">
                    <label htmlFor="event-host-type">Host type</label>
                    <select
                      id="event-host-type"
                      value={form.host_type}
                      onChange={(e) => update("host_type", e.target.value as HostType)}
                    >
                      <option value="aldrich">Aldrich</option>
                      <option value="featured">Featured</option>
                      <option value="partner">Partner</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="form-control">
                    <label htmlFor="event-image">Image URL</label>
                    <input
                      id="event-image"
                      value={form.image_url}
                      onChange={(e) => update("image_url", e.target.value)}
                    />
                  </div>
                  <div className="form-control">
                    <label htmlFor="event-program-slug">Registration program slug</label>
                    <input
                      id="event-program-slug"
                      value={form.registration_program_slug}
                      onChange={(e) => update("registration_program_slug", e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-control">
                  <label htmlFor="event-description">Description</label>
                  <textarea
                    id="event-description"
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="cta-row">
                  <button className="button primary" type="submit" disabled={formStatus.type === "loading"}>
                    {formStatus.type === "loading" ? "Saving..." : "Create Event"}
                  </button>
                  <button className="button ghost" type="button" onClick={resetForm}>
                    Reset
                  </button>
                </div>
              </form>
              {formStatus.message ? (
                <p className={`form-help ${formStatus.type === "error" ? "error" : "muted"}`}>{formStatus.message}</p>
              ) : null}
            </section>

            <section className="account-card">
              <div className="account-card__header">
                <div>
                  <h2>Existing Events</h2>
                  <p className="muted">Delete outdated or incorrect events.</p>
                </div>
                <button className="button ghost" type="button" onClick={() => void loadEvents()} disabled={loadingEvents}>
                  {loadingEvents ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              {loadingEvents ? <p className="muted">Loading events...</p> : null}
              {eventsError ? <p className="form-help error">{eventsError}</p> : null}
              {!loadingEvents && events.length === 0 ? <p className="muted">No events found.</p> : null}
              {!loadingEvents && events.length > 0 ? (
                <div className="event-list">
                  {events.map((event) => (
                    <article key={event.id} className="event-card-simple">
                      <div className="event-card__header">
                        <h3>{event.title}</h3>
                      </div>
                      <div className="event-card__meta">
                        <p className="muted">Date: {dateLabel(event.start_date, event.end_date)}</p>
                        {event.location ? <p className="muted">Location: {event.location}</p> : null}
                        {event.registration_program_slug ? (
                          <p className="muted">Program: {event.registration_program_slug}</p>
                        ) : null}
                      </div>
                      <div className="cta-row">
                        <button
                          className="button ghost"
                          type="button"
                          onClick={() => startEditing(event)}
                          disabled={editingId === event.id && savingEditId === event.id}
                        >
                          {editingId === event.id ? "Editing" : "Edit"}
                        </button>
                        <button
                          className="button ghost"
                          type="button"
                          onClick={() => void handleDeleteEvent(event.id, event.title)}
                          disabled={deletingId === event.id}
                        >
                          {deletingId === event.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                      {editingId === event.id ? (
                        <div className="register-form" style={{ marginTop: 12 }}>
                          <div className="register-form-grid">
                            <div className="form-control">
                              <label htmlFor={`edit-title-${event.id}`}>Title *</label>
                              <input
                                id={`edit-title-${event.id}`}
                                value={editForm.title}
                                onChange={(e) => updateEdit("title", e.target.value)}
                                required
                              />
                            </div>
                            <div className="form-control">
                              <label htmlFor={`edit-start-${event.id}`}>Start date</label>
                              <input
                                id={`edit-start-${event.id}`}
                                type="date"
                                value={editForm.start_date}
                                onChange={(e) => updateEdit("start_date", e.target.value)}
                              />
                            </div>
                            <div className="form-control">
                              <label htmlFor={`edit-end-${event.id}`}>End date</label>
                              <input
                                id={`edit-end-${event.id}`}
                                type="date"
                                value={editForm.end_date}
                                onChange={(e) => updateEdit("end_date", e.target.value)}
                              />
                            </div>
                            <div className="form-control">
                              <label htmlFor={`edit-time-${event.id}`}>Time info</label>
                              <input
                                id={`edit-time-${event.id}`}
                                value={editForm.time_info}
                                onChange={(e) => updateEdit("time_info", e.target.value)}
                              />
                            </div>
                            <div className="form-control">
                              <label htmlFor={`edit-location-${event.id}`}>Location</label>
                              <input
                                id={`edit-location-${event.id}`}
                                value={editForm.location}
                                onChange={(e) => updateEdit("location", e.target.value)}
                              />
                            </div>
                            <div className="form-control">
                              <label htmlFor={`edit-host-${event.id}`}>Host type</label>
                              <select
                                id={`edit-host-${event.id}`}
                                value={editForm.host_type}
                                onChange={(e) => updateEdit("host_type", e.target.value as HostType)}
                              >
                                <option value="aldrich">Aldrich</option>
                                <option value="featured">Featured</option>
                                <option value="partner">Partner</option>
                                <option value="other">Other</option>
                              </select>
                            </div>
                            <div className="form-control">
                              <label htmlFor={`edit-image-${event.id}`}>Image URL</label>
                              <input
                                id={`edit-image-${event.id}`}
                                value={editForm.image_url}
                                onChange={(e) => updateEdit("image_url", e.target.value)}
                              />
                            </div>
                            <div className="form-control">
                              <label htmlFor={`edit-slug-${event.id}`}>Registration program slug</label>
                              <input
                                id={`edit-slug-${event.id}`}
                                value={editForm.registration_program_slug}
                                onChange={(e) => updateEdit("registration_program_slug", e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="form-control">
                            <label htmlFor={`edit-description-${event.id}`}>Description</label>
                            <textarea
                              id={`edit-description-${event.id}`}
                              value={editForm.description}
                              onChange={(e) => updateEdit("description", e.target.value)}
                              rows={3}
                            />
                          </div>
                          <div className="cta-row">
                            <button
                              className="button primary"
                              type="button"
                              onClick={() => void handleSaveEdit(event.id)}
                              disabled={savingEditId === event.id}
                            >
                              {savingEditId === event.id ? "Saving..." : "Save"}
                            </button>
                            <button className="button ghost" type="button" onClick={cancelEditing}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
