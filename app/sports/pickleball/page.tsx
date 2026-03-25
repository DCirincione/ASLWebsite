"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { EventDetailModal } from "@/components/event-detail-modal";
import { HistoryBackButton } from "@/components/history-back-button";
import { PageShell } from "@/components/page-shell";
import { RegistrationModal } from "@/components/registration-modal";
import { Section } from "@/components/section";
import { getSignupActionLabel, getSignupSubmittedLabel, getSignupUnavailableLabel } from "@/lib/event-signups";
import { supabase } from "@/lib/supabase/client";
import { useRegisteredEventIds } from "@/lib/supabase/use-registered-program-slugs";
import type { Event } from "@/lib/supabase/types";

type SportEvent = Event & { image?: string };
type EventBucket = "league" | "tournament" | "other";

const bucketFromSlug = (registrationSlug?: string | null): EventBucket => {
  const value = (registrationSlug ?? "").trim().toLowerCase();

  if (value.startsWith("pickleball-league")) return "league";
  if (value.startsWith("pickleball-tournament")) return "tournament";

  return "other";
};

export default function PickleballPage() {
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalEventId, setModalEventId] = useState<string | null>(null);
  const [modalTitle, setModalTitle] = useState<string | null>(null);
  const [detailEvent, setDetailEvent] = useState<SportEvent | null>(null);
  const { isRegisteredEvent, refreshRegisteredEvents } = useRegisteredEventIds();

  useEffect(() => {
    const loadEvents = async () => {
      if (!supabase) return;
      setLoadingEvents(true);
      const { data, error } = await supabase
        .from("events")
        .select("id,title,start_date,end_date,time_info,location,description,signup_mode,registration_program_slug,image_url,registration_enabled")
        .order("start_date", { ascending: true, nullsFirst: false });

      if (!error && data) {
        const pickleballOnly = (data as Event[]).filter((row) =>
          (row.registration_program_slug ?? "").trim().toLowerCase().startsWith("pickleball-")
        );
        const mapped = pickleballOnly.map((row) => ({
          ...row,
          image: row.image_url || undefined,
        }));
        setEvents(mapped);
      } else {
        setEvents([]);
      }
      setLoadingEvents(false);
    };

    loadEvents();
  }, []);

  const byType = useMemo(() => {
    const leagues = events.filter((ev) => bucketFromSlug(ev.registration_program_slug) === "league");
    const tournaments = events.filter((ev) => bucketFromSlug(ev.registration_program_slug) === "tournament");
    return { leagues, tournaments };
  }, [events]);

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

  const openModal = (eventId?: string | null, title?: string) => {
    const normalizedEventId = eventId?.trim();
    if (!normalizedEventId || isRegisteredEvent(normalizedEventId)) return;
    setDetailEvent(null);
    setModalEventId(normalizedEventId);
    setModalTitle(title ?? null);
    setModalOpen(true);
  };

  const primaryTimeLabel = (event: SportEvent) => {
    const time = event.time_info?.trim();
    const dateRange = formatDateRange(event.start_date, event.end_date);
    if (dateRange && time) return dateRange + " • " + time;
    return dateRange || time || "Date TBD";
  };

  const renderCards = (list: SportEvent[]) => {
    if (!list || list.length === 0) {
      return <p className="muted">No items posted yet.</p>;
    }

    return (
      <div className="list list--grid">
        {list.map((item, idx) => (
          <article key={item.id ?? idx} className="soccer-card">
            <div className="soccer-card__media">
              {item.image ? (
                <Image
                  src={item.image}
                  alt=""
                  fill
                  sizes="(max-width: 900px) 100vw, 33vw"
                />
              ) : null}
            </div>
            <div className="soccer-card__body">
              <p className="list__title">{item.title}</p>
              <p className="muted">{primaryTimeLabel(item)}</p>
              <div className="cta-row">
                <button className="button ghost" type="button" onClick={() => setDetailEvent(item)}>
                  View Details
                </button>
                <button
                  className="button primary"
                  type="button"
                  disabled={!item.registration_enabled || isRegisteredEvent(item.id)}
                  onClick={() => openModal(item.id, item.title)}
                >
                  {!item.registration_enabled ? getSignupUnavailableLabel(item) : isRegisteredEvent(item.id) ? getSignupSubmittedLabel(item) : getSignupActionLabel(item)}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  };

  return (
    <PageShell>
      <div style={{ paddingTop: 16 }}>
        <HistoryBackButton label="← Back" fallbackHref="/sports" />
      </div>
      <Section
        id="pickleball-hero"
        eyebrow="Pickleball"
        title="Play Pickleball with Aldrich"
        description="League seasons and tournament weekends for all levels."
        headingLevel="h1"
        className="soccer-hero"
      >
        <div className="soccer-hero__grid">
          <div className="soccer-hero__copy">
            <div className="cta-row">
              <Link className="button primary" href="#leagues">
                Leagues
              </Link>
              <Link className="button ghost" href="#tournaments">
                Tournaments
              </Link>
              <Link className="button ghost" href="#events">
                Events
              </Link>
            </div>
          </div>
          <div className="soccer-hero__logo">
            <Image src="/ASLLogo.png" alt="Aldrich Pickleball" fill priority />
          </div>
        </div>
      </Section>

      <Section
        id="leagues"
        eyebrow="Leagues"
        title="League Play"
        description="Season-based league schedules with standings and playoffs."
        headingLevel="h2"
        className="soccer-section"
      >
        {loadingEvents ? <p className="muted">Loading leagues...</p> : renderCards(byType.leagues)}
      </Section>

      <Section
        id="tournaments"
        eyebrow="Tournaments"
        title="Tournament Play"
        description="Bracketed events and showcase weekends."
        headingLevel="h2"
        className="soccer-section"
      >
        {loadingEvents ? <p className="muted">Loading tournaments...</p> : renderCards(byType.tournaments)}
      </Section>

      <Section
        id="events"
        eyebrow="Events"
        title="Featured Pickleball Events"
        description="League and tournament highlights from the pickleball calendar."
        headingLevel="h2"
        className="sport-event-section"
      >
        {loadingEvents ? <p className="muted">Loading events...</p> : null}
        {!loadingEvents && events.length === 0 ? (
          <p className="muted">No pickleball events yet. Check back soon.</p>
        ) : null}
        {!loadingEvents && events.length > 0 ? (
          <div className="sport-event-list">
            {events.map((ev) => (
              <article key={ev.id} className="sport-event-card">
                {ev.image ? (
                  <div className="sport-event-card__media">
                    <Image src={ev.image} alt="" width={200} height={130} />
                  </div>
                ) : null}
                <div className="sport-event-card__body">
                  <p className="eyebrow">Pickleball</p>
                  <h3>{ev.title}</h3>
                  <p className="sport-event__meta">
                    <span>{primaryTimeLabel(ev)}</span>
                  </p>
                  <div className="sport-event__actions">
                    <button className="button ghost" type="button" onClick={() => setDetailEvent(ev)}>
                      View Details
                    </button>
                    <button
                      className="button primary"
                      type="button"
                      disabled={!ev.registration_enabled || isRegisteredEvent(ev.id)}
                      onClick={() => openModal(ev.id, ev.title)}
                    >
                      {!ev.registration_enabled ? getSignupUnavailableLabel(ev) : isRegisteredEvent(ev.id) ? getSignupSubmittedLabel(ev) : getSignupActionLabel(ev)}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </Section>

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
        dateLabel={detailEvent ? primaryTimeLabel(detailEvent) : undefined}
        isRegistered={isRegisteredEvent(detailEvent?.id)}
        onClose={() => setDetailEvent(null)}
        onRegister={(event) => openModal(event.id, event.title)}
      />
    </PageShell>
  );
}
