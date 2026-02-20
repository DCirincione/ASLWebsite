"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { EventDetailModal } from "@/components/event-detail-modal";
import { RegistrationModal } from "@/components/registration-modal";
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
  host_type?: "aldrich" | "featured" | "partner" | "other" | null;
  image_url?: string | null;
  registration_program_slug?: string | null;
  image?: string;
};

export default function EventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [modalSlug, setModalSlug] = useState<string | null>(null);
  const [modalTitle, setModalTitle] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<EventItem | null>(null);

  useEffect(() => {
    const loadEvents = async () => {
      if (!supabase) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("events")
        .select("id,title,start_date,end_date,time_info,location,description,status,host_type,image_url,registration_program_slug")
        .order("start_date", { ascending: true, nullsFirst: false });
      if (!error && data) {
        setEvents(data as EventItem[]);
      }
      setLoading(false);
    };
    loadEvents();
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    client.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user.id ?? null;
      setUserId(uid);
    });

    return () => {
      subscription?.subscription.unsubscribe();
    };
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

  const primaryDateLabel = (event: EventItem) => {
    const dateRange = formatDateRange(event.start_date, event.end_date);
    const timeInfo = event.time_info?.trim();
    return timeInfo || dateRange || "Date TBD";
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

  const handleJump = (targetId: string) => {
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const ensureImage = (event: EventItem) => event.image_url || undefined;

  const sortByStartDate = (a: EventItem, b: EventItem) => {
    const aDate = parseDateUTC(a.start_date);
    const bDate = parseDateUTC(b.start_date);
    if (!aDate && !bDate) return 0;
    if (!aDate) return 1;
    if (!bDate) return -1;
    return aDate.getTime() - bDate.getTime();
  };

  const prepareCollections = () => {
    const ordered = [...events].sort(sortByStartDate);

    const heuristicAldrich = (event: EventItem) => {
      const titleMatch = event.title?.toLowerCase().includes("aldrich");
      const locationMatch = event.location?.toLowerCase().includes("aldrich");
      const clearlyScheduled = event.status === "scheduled";
      return Boolean(titleMatch || locationMatch || clearlyScheduled);
    };

    const heuristicFeatured = (event: EventItem) => {
      const text = `${event.title ?? ""} ${event.description ?? ""}`.toLowerCase();
      const keywords = ["charity", "fundraiser", "benefit", "partner", "with", "hosted by", "vs"];
      return keywords.some((kw) => text.includes(kw)) || event.status === "potential";
    };

    const aldrich = ordered.filter(
      (event) => event.host_type === "aldrich" || (!event.host_type && heuristicAldrich(event))
    );

    const featured = ordered.filter(
      (event) =>
        event.host_type === "featured" ||
        event.host_type === "partner" ||
        (!event.host_type && heuristicFeatured(event))
    );

    const featuredFallback = ordered.slice(0, 4);

    return {
      aldrichEvents: (aldrich.length > 0 ? aldrich : featuredFallback).map((ev, idx) => ({
        ...ev,
        image: ensureImage(ev),
      })),
      featuredEvents: (featured.length > 0 ? featured : featuredFallback).map((ev, idx) => ({
        ...ev,
        image: ensureImage(ev),
      })),
      allEvents: ordered.map((ev, idx) => ({
        ...ev,
        image: ensureImage(ev),
      })),
    };
  };

  const renderEventCard = (event: EventItem) => {
    const primaryDate = primaryDateLabel(event);

    return (
      <article key={event.id} className="event-card event-card--full">
        <div
          className="event-card__image event-card__image--interactive"
          style={{ backgroundImage: event.image ? `url(${event.image})` : undefined }}
          role="button"
          tabIndex={0}
          aria-label={`Open details for ${event.title}`}
          onClick={() => setDetailEvent(event)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setDetailEvent(event);
            }
          }}
        />
        <div className="event-card__body">
          <div className="event-card__header">
            <h3 className="event-card__title">{event.title}</h3>
            <span className={statusClass(event.status)}>{statusLabel(event.status)}</span>
          </div>
          <div className="event-card__meta">
            <div className="event-card__meta-row">
              <span aria-hidden>📅</span>
              <span>{primaryDate}</span>
            </div>
            <div className="event-card__meta-row">
              <span aria-hidden>📍</span>
              <span>{event.location || "Location TBD"}</span>
            </div>
          </div>
          {event.description ? <p className="muted">{event.description}</p> : null}
          <div className="event-card__actions">
            <button
              className="button primary"
              type="button"
              onClick={() => {
                if (!event.registration_program_slug) {
                  setMessage("Registration for this event is not available yet.");
                  return;
                }
                if (!userId) {
                  router.push("/account");
                  return;
                }
                setModalSlug(event.registration_program_slug);
                setModalTitle(event.title);
                setModalOpen(true);
              }}
              disabled={!event.registration_program_slug}
            >
              {event.registration_program_slug ? "Register" : "Registration coming soon"}
            </button>
          </div>
        </div>
      </article>
    );
  };

  return (
    <PageShell>
      <Section
        id="events-page"
        eyebrow="Events"
        title="Upcoming Events"
        description="Tournaments, showcases, leagues, pick-up sessions, and fundraisers. See what's coming up and plan your season."
        headingLevel="h1"
        className="events-section"
      >
        {message ? (
          <p className="muted" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
        {loading ? <p className="muted">Loading events...</p> : null}

        {!loading ? (
          (() => {
            const collections = prepareCollections();
            const hasEvents = collections.allEvents.length > 0;
            if (!hasEvents) {
              return <p className="muted">No events posted yet. Check back soon.</p>;
            }
            return (
              <>
                <div className="events-jump">
                  <label htmlFor="events-jump-select">Jump to</label>
                  <select
                    id="events-jump-select"
                    onChange={(e) => handleJump(e.target.value)}
                    defaultValue="aldrich-events"
                  >
                    <option value="aldrich-events">Aldrich Events</option>
                    <option value="featured-events">Featured Events</option>
                    <option value="all-events">All Events</option>
                  </select>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => handleJump("events-page")}
                  >
                    Back to top
                  </button>
                </div>
                <div className="events-deck">
                <div className="events-group" id="aldrich-events">
                  <div className="events-group__header">
                    <p className="eyebrow">Aldrich Sports</p>
                    <h2>Aldrich Events</h2>
                    <p className="muted">
                      Official ASL-hosted tournaments, leagues, and showcases.
                    </p>
                  </div>
                  <div className="event-card-grid">
                    {collections.aldrichEvents.map(renderEventCard)}
                  </div>
                </div>

                <div className="events-group" id="featured-events">
                  <div className="events-group__header">
                    <p className="eyebrow">Spotlight</p>
                    <h2>Featured Events</h2>
                    <p className="muted">Partnered events, showcases, and community benefits.</p>
                  </div>
                  <div className="event-card-grid">
                    {collections.featuredEvents.map(renderEventCard)}
                  </div>
                </div>

                <div className="events-group" id="all-events">
                  <div className="events-group__header">
                    <p className="eyebrow">Everything Coming Up</p>
                    <h2>All Events</h2>
                    <p className="muted">
                      Full calendar, sorted by date so you can plan ahead.
                    </p>
                  </div>
                  <div className="event-card-grid">
                    {collections.allEvents.map(renderEventCard)}
                  </div>
                </div>
              </div>
              </>
            );
          })()
        ) : null}
      </Section>
      <RegistrationModal
        open={modalOpen}
        programSlug={modalSlug}
        contextTitle={modalTitle ?? undefined}
        onClose={() => setModalOpen(false)}
      />
      <EventDetailModal
        open={Boolean(detailEvent)}
        event={detailEvent}
        dateLabel={detailEvent ? primaryDateLabel(detailEvent) : undefined}
        onClose={() => setDetailEvent(null)}
        onRegister={(event) => {
          if (!event.registration_program_slug) {
            setMessage("Registration for this event is not available yet.");
            return;
          }
          if (!userId) {
            router.push("/account");
            return;
          }
          setDetailEvent(null);
          setModalSlug(event.registration_program_slug);
          setModalTitle(event.title);
          setModalOpen(true);
        }}
      />
    </PageShell>
  );
}
