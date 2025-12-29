"use client";
import { useEffect, useState } from "react";
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

  return (
    <PageShell>
      <Section
        id="events-page"
        eyebrow="Events"
        title="Upcoming Events"
        description="Tournaments, showcases, leagues, and fundraisers. See what's coming up and plan your season."
        headingLevel="h1"
      >
        <div className="event-list">
          {loading ? <p className="muted">Loading events...</p> : null}
          {!loading &&
            events.map((event) => (
              <article key={event.id} className="event-card-simple">
                <div className="event-card__header">
                  <h3>{event.title}</h3>
                  <span className={statusClass(event.status)}>{statusLabel(event.status)}</span>
                </div>
                <div className="event-card__meta">
                  {event.time_info ? <p className="muted">{event.time_info}</p> : null}
                  {event.location ? <p className="muted">{event.location}</p> : null}
                </div>
                {event.description ? <p className="muted">{event.description}</p> : null}
              </article>
            ))}
        </div>
      </Section>
    </PageShell>
  );
}
