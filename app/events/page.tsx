"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { supabase } from "@/lib/supabase/client";

type EventItem = {
  id: string;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  time_info?: string | null;
  location?: string | null;
  description?: string | null;
  status?: "scheduled" | "potential" | "tbd" | null;
};

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [signups, setSignups] = useState<Set<string>>(new Set());
  const [savingEventId, setSavingEventId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadEvents = async () => {
      if (!supabase) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("events")
        .select("id,title,start_date,end_date,time_info,location,description,status")
        .order("start_date", { ascending: true, nullsFirst: false });
      if (!error && data) {
        setEvents(data as EventItem[]);
      }
      setLoading(false);
    };
    loadEvents();
  }, []);

  const loadSignups = useCallback(async (uid: string) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("event_signups")
      .select("event_id")
      .eq("user_id", uid);
    if (!error && data) {
      setSignups(new Set(data.map((row) => row.event_id)));
    }
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    client.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (uid) {
        loadSignups(uid);
      }
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user.id ?? null;
      setUserId(uid);
      if (uid) {
        loadSignups(uid);
      } else {
        setSignups(new Set());
      }
    });

    return () => {
      subscription?.subscription.unsubscribe();
    };
  }, [loadSignups]);

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

  const handleSignup = async (eventId: string) => {
    if (!supabase) {
      setMessage("Connect Supabase to enable event sign-ups.");
      return;
    }
    if (!userId) {
      setMessage("Sign in to join events and track them in My Events.");
      return;
    }

    setSavingEventId(eventId);
    setMessage(null);
    const { error } = await supabase
      .from("event_signups")
      .upsert({ event_id: eventId, user_id: userId }, { onConflict: "event_id,user_id" });

    if (error) {
      setMessage("Could not save your sign-up. Please try again.");
    } else {
      setSignups((prev) => {
        const next = new Set(prev);
        next.add(eventId);
        return next;
      });
      setMessage("Added to My Events.");
    }
    setSavingEventId(null);
  };

  return (
    <PageShell>
      <Section
        id="events-page"
        eyebrow="Events"
        title="Upcoming Events"
        description="Tournaments, showcases, leagues, and fundraisers. See what's coming up and plan your season."
        headingLevel="h1"
      >
        {message ? (
          <p className="muted" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
        <div className="event-list">
          {loading ? <p className="muted">Loading events...</p> : null}
          {!loading &&
            events.map((event) => {
              const dateRange = formatDateRange(event.start_date, event.end_date);
              const timeInfo = event.time_info?.trim();
              const primaryDate = timeInfo || dateRange || null;
              return (
              <article key={event.id} className="event-card-simple">
                <div className="event-card__header">
                  <h3>{event.title}</h3>
                  <span className={statusClass(event.status)}>{statusLabel(event.status)}</span>
                </div>
                <div className="event-card__meta">
                  {primaryDate ? <p className="muted">Date: {primaryDate}</p> : null}
                  {event.location ? <p className="muted">Location: {event.location}</p> : null}
                </div>
                {event.description ? <p className="muted">About this event: {event.description}</p> : null}
                <div className="event-card__actions">
                  {signups.has(event.id) ? (
                    <span className="pill pill--green" role="status" aria-live="polite">
                      Added to My Events
                    </span>
                  ) : userId ? (
                    <button
                      className="button primary"
                      type="button"
                      disabled={savingEventId === event.id}
                      onClick={() => handleSignup(event.id)}
                    >
                      {savingEventId === event.id ? "Saving..." : "Sign up"}
                    </button>
                  ) : (
                    <Link className="button ghost" href="/account">
                      Sign in to sign up
                    </Link>
                  )}
                </div>
              </article>
            );
            })}
        </div>
      </Section>
    </PageShell>
  );
}
