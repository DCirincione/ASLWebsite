"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { EventDetailModal } from "@/components/event-detail-modal";
import { RegistrationModal } from "@/components/registration-modal";
import { supabase } from "@/lib/supabase/client";
import { isRegularAslSundayLeagueEvent, SUNDAY_LEAGUE_HREF } from "@/lib/sunday-league";
import { useRegisteredEventIds } from "@/lib/supabase/use-registered-program-slugs";

type HomeEvent = {
  id: string;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  time_info?: string | null;
  location?: string | null;
  description?: string | null;
  host_type?: "aldrich" | "featured" | "partner" | "other" | null;
  image_url?: string | null;
  registration_program_slug?: string | null;
  registration_enabled?: boolean | null;
  image?: string | null;
};

const fallbackEvents: HomeEvent[] = [
  {
    id: "fallback-1",
    title: "3v3 Basketball Tournament",
    start_date: "2024-03-15",
    location: "Central Sports Complex",
    image_url:
      "https://images.unsplash.com/photo-1505666287802-931dc83948e0?auto=format&fit=crop&w=800&q=80",
    registration_enabled: false,
  },
  {
    id: "fallback-2",
    title: "Pickleball League",
    start_date: "2024-03-20",
    location: "Riverside Courts",
    registration_enabled: false,
  },
  {
    id: "fallback-3",
    title: "Flag Football Tournament",
    start_date: "2024-04-05",
    location: "Green Field Park",
    image_url:
      "https://images.unsplash.com/photo-1471295253337-3ceaaedca402?auto=format&fit=crop&w=800&q=80",
    registration_enabled: false,
  },
  {
    id: "fallback-4",
    title: "Community vs Kids Charity Game",
    start_date: "2024-04-12",
    location: "Central Sports Complex",
    image_url:
      "https://images.unsplash.com/photo-1508609349937-5ec4ae374ebf?auto=format&fit=crop&w=800&q=80",
    registration_enabled: false,
  },
];

const formatDate = (value?: string | null) => {
  if (!value) return "Date TBD";
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return "Date TBD";
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
};

const formatDateRange = (start?: string | null, end?: string | null) => {
  const startLabel = formatDate(start);
  if (!end || !start || start === end) return startLabel;
  return `${startLabel} - ${formatDate(end)}`;
};

export function HomeUpcomingEvents() {
  const router = useRouter();
  const [events, setEvents] = useState<HomeEvent[]>(fallbackEvents);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [modalEventId, setModalEventId] = useState<string | null>(null);
  const [modalTitle, setModalTitle] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<HomeEvent | null>(null);
  const { isRegisteredEvent, refreshRegisteredEvents } = useRegisteredEventIds();

  useEffect(() => {
    const loadEvents = async () => {
      if (!supabase) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("events")
        .select("id,title,start_date,end_date,time_info,location,description,host_type,image_url,registration_program_slug,registration_enabled")
        .order("start_date", { ascending: true, nullsFirst: false })
        .limit(4);

      if (!error && data && data.length > 0) {
        setEvents(data as HomeEvent[]);
      }
      setLoading(false);
    };

    const loadSession = async () => {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      setUserId(data.session?.user.id ?? null);
    };

    void loadEvents();
    void loadSession();
  }, []);

  const primaryDateLabel = (event: HomeEvent) => {
    const dateRange = formatDateRange(event.start_date, event.end_date);
    const timeInfo = event.time_info?.trim();
    if (dateRange && timeInfo) return `${dateRange} • ${timeInfo}`;
    return dateRange || timeInfo || "Date TBD";
  };

  return (
    <>
      {message ? (
        <p className="muted" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      {loading ? <p className="muted">Loading events...</p> : null}
      <div className="event-grid">
        {events.map((event, idx) => {
          const canRegister = Boolean(event.registration_enabled);
          const isRegistered = isRegisteredEvent(event.id);
          const isSundayLeague = isRegularAslSundayLeagueEvent(event);
          return (
            <article key={`${event.id}-${idx}`} className="event-card">
              <div
                className="event-card__image"
                style={{
                  backgroundImage: event.image_url ? `url(${event.image_url})` : undefined,
                }}
                aria-hidden
              />
              <div className="event-card__body">
                <h3 className="event-card__title">{event.title}</h3>
                <div className="event-card__footer" style={{ display: "grid", gap: 14 }}>
                  <div className="event-card__meta">
                    <div className="event-card__meta-row">
                      <span aria-hidden>📅</span>
                      <span>{primaryDateLabel(event)}</span>
                    </div>
                    <div className="event-card__meta-row">
                      <span aria-hidden>📍</span>
                      <span>{event.location || "Location TBD"}</span>
                    </div>
                  </div>
                  <div className="cta-row">
                    {isSundayLeague ? (
                      <>
                        <Link className="button ghost" href={SUNDAY_LEAGUE_HREF}>
                          View Details
                        </Link>
                        <Link className="button primary" href={`${SUNDAY_LEAGUE_HREF}#join-team`}>
                          Join a Team
                        </Link>
                        <Link className="button ghost" href={`${SUNDAY_LEAGUE_HREF}#create-team`}>
                          Create a Team
                        </Link>
                      </>
                    ) : (
                      <>
                        <button className="button ghost" type="button" onClick={() => setDetailEvent(event)}>
                          View Details
                        </button>
                        <button
                          className="button primary"
                          type="button"
                          onClick={() => {
                            if (!canRegister) {
                              setMessage("Registration for this event is not available yet.");
                              return;
                            }
                            if (isRegistered) {
                              return;
                            }
                            if (!userId) {
                              router.push("/account");
                              return;
                            }
                            setModalEventId(event.id);
                            setModalTitle(event.title);
                            setModalOpen(true);
                          }}
                          disabled={!canRegister || isRegistered}
                        >
                          {!canRegister ? "Registration coming soon" : isRegistered ? "Registered" : "Register"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <RegistrationModal
        open={modalOpen}
        eventId={modalEventId}
        contextTitle={modalTitle ?? undefined}
        onClose={() => setModalOpen(false)}
        onSubmitted={refreshRegisteredEvents}
      />
      <EventDetailModal
        open={Boolean(detailEvent)}
        event={detailEvent}
        dateLabel={detailEvent ? primaryDateLabel(detailEvent) : undefined}
        isRegistered={isRegisteredEvent(detailEvent?.id)}
        onClose={() => setDetailEvent(null)}
        onRegister={(event) => {
          if (!event.registration_enabled) {
            setMessage("Registration for this event is not available yet.");
            return;
          }
          if (isRegisteredEvent(event.id)) {
            return;
          }
          if (!userId) {
            router.push("/account");
            return;
          }
          setDetailEvent(null);
          setModalEventId(event.id);
          setModalTitle(event.title);
          setModalOpen(true);
        }}
      />
    </>
  );
}
