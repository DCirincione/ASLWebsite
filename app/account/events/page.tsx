"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AccessibilityControls } from "@/components/accessibility-controls";
import { supabase } from "@/lib/supabase/client";
import type { Event } from "@/lib/supabase/types";

const fallbackEvents: Event[] = [
  {
    id: "fallback-1",
    title: "3v3 Basketball Tournament",
    start_date: "2024-03-15",
    end_date: "2024-03-15",
    time_info: "8:00 AM tip-off",
    location: "Central Sports Complex",
    description: "Fast-paced half-court games for every division.",
    status: "scheduled",
  },
  {
    id: "fallback-2",
    title: "Pickleball League",
    start_date: "2024-03-20",
    end_date: "2024-04-20",
    time_info: "Weeknight doubles",
    location: "Riverside Courts",
    description: "Round-robin league with playoffs and prizes.",
    status: "potential",
  },
];

type SignupRow = {
  event_id: string;
};

export default function AccountEventsPage() {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "no-session">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadEvents = async () => {
      setError(null);
      if (!supabase) {
        setEvents(fallbackEvents);
        setStatus("ready");
        setError("Connect Supabase to load your saved events.");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;

      if (!userId) {
        setStatus("no-session");
        return;
      }

      const { data: signups, error: signupsError } = await supabase
        .from("event_signups")
        .select("event_id")
        .eq("user_id", userId);

      if (signupsError) {
        setEvents(fallbackEvents);
        setStatus("ready");
        setError("Could not load your saved events yet.");
        return;
      }

      const eventIds = (signups as SignupRow[]).map((row) => row.event_id).filter(Boolean);
      if (eventIds.length === 0) {
        setEvents([]);
        setStatus("ready");
        return;
      }

      const { data: eventData, error: eventsError } = await supabase
        .from("events")
        .select("id,title,start_date,end_date,time_info,location,description,status")
        .in("id", eventIds);

      if (eventsError) {
        setEvents(fallbackEvents);
        setError("Could not load event details. Showing sample schedule.");
      } else {
        setEvents((eventData ?? []) as Event[]);
      }
      setStatus("ready");
    };

    loadEvents();
  }, []);

  const parseDateUTC = (value?: string | null) => {
    if (!value) return null;
    const parts = value.split("-").map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
    const [year, month, day] = parts;
    return new Date(Date.UTC(year, month - 1, day));
  };

  const formatDateRange = (start?: string | null, end?: string | null) => {
    if (!start && !end) return "";
    const startDate = parseDateUTC(start);
    const endDate = parseDateUTC(end);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
    if (startDate && endDate) {
      const sameMonth = startDate.getMonth() === endDate.getMonth();
      const sameYear = startDate.getFullYear() === endDate.getFullYear();
      const startStr = startDate.toLocaleDateString(undefined, opts);
      const endStr = endDate.toLocaleDateString(
        undefined,
        sameMonth && sameYear ? { day: "numeric", timeZone: "UTC" } : opts
      );
      return `${startStr} – ${endStr}`;
    }
    if (startDate) return startDate.toLocaleDateString(undefined, opts);
    return "";
  };

  const statusLabel = (status?: string | null) => {
    if (status === "potential") return "Potential";
    if (status === "tbd") return "TBD";
    return "Scheduled";
  };

  const statusClass = (status?: string | null) => {
    if (status === "potential") return "pill pill--amber";
    if (status === "tbd") return "pill pill--muted";
    return "pill pill--green";
  };

  const list = events ?? [];

  return (
    <>
      <AccessibilityControls />
      <nav className="account-nav shell" aria-label="Account navigation">
        <Link className="button ghost" href="/">
          ← Back
        </Link>
      </nav>
      <div className="account-body shell">
        <header className="account-header">
          <div>
            <p className="eyebrow">Account</p>
            <h1>My Events</h1>
            <p className="muted">Events you have signed up for.</p>
          </div>
          <Link className="button primary" href="/events">
            Browse Events
          </Link>
        </header>

        <section className="account-card">
          {error ? (
            <p className="muted" role="status" aria-live="polite">
              {error}
            </p>
          ) : null}
          {status === "loading" ? (
            <p className="muted">Loading your events...</p>
          ) : status === "no-session" ? (
            <p className="muted">Sign in to view and manage your events.</p>
          ) : list.length === 0 ? (
            <p className="muted">
              No events yet. <Link href="/events">Browse upcoming events</Link> to join.
            </p>
          ) : (
            <div className="event-list">
              {list.map((event) => {
                const dateRange = formatDateRange(event.start_date, event.end_date);
                return (
                  <article key={event.id} className="event-card-simple">
                    <div className="event-card__header">
                      <h3>{event.title}</h3>
                      <span className={statusClass(event.status)}>{statusLabel(event.status)}</span>
                    </div>
                    <div className="event-card__meta">
                      {dateRange ? <p className="muted">{dateRange}</p> : null}
                      {event.time_info ? <p className="muted">{event.time_info}</p> : null}
                      {event.location ? <p className="muted">{event.location}</p> : null}
                    </div>
                    {event.description ? <p className="muted">{event.description}</p> : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
