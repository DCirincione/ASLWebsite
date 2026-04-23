"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { EventDetailModal } from "@/components/event-detail-modal";
import { RegistrationModal } from "@/components/registration-modal";
import {
  getSignupActionLabel,
  getSignupSubmittedLabel,
  getSignupUnavailableLabel,
  getSignupUnavailableMessage,
} from "@/lib/event-signups";
import { formatEventSignupLabel, loadVisiblePublicEvents, type PublicEventSignupStats } from "@/lib/public-event-signups";
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
  approval_status?: "approved" | "pending_approval" | "changes_requested" | null;
  image_url?: string | null;
  signup_mode?: "registration" | "waitlist" | null;
  registration_program_slug?: string | null;
  registration_enabled?: boolean | null;
  registration_limit?: number | null;
  image?: string | null;
} & PublicEventSignupStats;

const fallbackEvents: HomeEvent[] = [
  {
    id: "fallback-1",
    title: "3v3 Basketball Tournament",
    start_date: "2024-03-15",
    location: "Central Sports Complex",
    signup_count: 0,
    image_url:
      "https://images.unsplash.com/photo-1505666287802-931dc83948e0?auto=format&fit=crop&w=800&q=80",
    registration_enabled: false,
  },
  {
    id: "fallback-2",
    title: "Pickleball League",
    start_date: "2024-03-20",
    location: "Riverside Courts",
    signup_count: 0,
    registration_enabled: false,
  },
  {
    id: "fallback-3",
    title: "Flag Football Tournament",
    start_date: "2024-04-05",
    location: "Green Field Park",
    signup_count: 0,
    image_url:
      "https://images.unsplash.com/photo-1471295253337-3ceaaedca402?auto=format&fit=crop&w=800&q=80",
    registration_enabled: false,
  },
  {
    id: "fallback-4",
    title: "Community vs Kids Charity Game",
    start_date: "2024-04-12",
    location: "Central Sports Complex",
    signup_count: 0,
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
      const data = await loadVisiblePublicEvents<HomeEvent>(supabase, { limit: 12 });
      if (data.length > 0) {
        setEvents(data.slice(0, 4));
      }
      setLoading(false);
    };

    void loadEvents();
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
              >
                <span className="event-card__image-badge">
                  {formatEventSignupLabel(event.signup_count, event.registration_limit, event.signup_unit)}
                </span>
              </div>
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
                  <div className="event-card__actions">
                    {isSundayLeague ? (
                      <>
                        <button
                          className="button ghost"
                          type="button"
                          onClick={() => router.push(SUNDAY_LEAGUE_HREF)}
                        >
                          View Details
                        </button>
                        <button
                          className="button primary"
                          type="button"
                          onClick={() => router.push(SUNDAY_LEAGUE_HREF)}
                        >
                          Register
                        </button>
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
                              setMessage(getSignupUnavailableMessage(event));
                              return;
                            }
                            if (isRegistered) {
                              return;
                            }
                            setModalEventId(event.id);
                            setModalTitle(event.title);
                            setModalOpen(true);
                          }}
                          disabled={!canRegister || isRegistered}
                        >
                          {!canRegister ? getSignupUnavailableLabel(event) : isRegistered ? getSignupSubmittedLabel(event) : getSignupActionLabel(event)}
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
            setMessage(getSignupUnavailableMessage(event));
            return;
          }
          if (isRegisteredEvent(event.id)) {
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
