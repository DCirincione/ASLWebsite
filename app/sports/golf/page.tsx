"use client";
import "../sports.css";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { EventDetailModal } from "@/components/event-detail-modal";
import { HistoryBackButton } from "@/components/history-back-button";
import { PageShell } from "@/components/page-shell";
import { RegistrationModal } from "@/components/registration-modal";
import { Section } from "@/components/section";
import { SportEventCard } from "@/components/sport-event-card";
import { filterVisiblePublicEvents } from "@/lib/event-approval";
import { getSignupActionLabel, getSignupSubmittedLabel, getSignupUnavailableLabel } from "@/lib/event-signups";
import { attachPublicEventSignupCounts, formatEventSignupLabel, type PublicEventSignupStats } from "@/lib/public-event-signups";
import { sportMatchesEvent } from "@/lib/sports";
import { supabase } from "@/lib/supabase/client";
import { useRegisteredEventIds } from "@/lib/supabase/use-registered-program-slugs";
import type { Event, Sport } from "@/lib/supabase/types";

type SportEvent = Event & PublicEventSignupStats & { image?: string };

export default function GolfPage() {
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
      const [{ data, error }, { data: sportsData, error: sportsError }] = await Promise.all([
        supabase
          .from("events")
          .select("id,title,start_date,end_date,time_info,location,description,host_type,approval_status,signup_mode,registration_program_slug,sport_id,image_url,registration_enabled,registration_limit")
          .order("start_date", { ascending: true, nullsFirst: false }),
        supabase.from("sports").select("id,title").order("title", { ascending: true }),
      ]);

      if (!error && !sportsError && data) {
        const sports = (sportsData ?? []) as Sport[];
        const golfOnly = filterVisiblePublicEvents(data as Event[]).filter((row) =>
          sportMatchesEvent(row, "golf", sports) &&
          (row.registration_program_slug ?? "").trim().toLowerCase().startsWith("golf-tournament")
        );
        const withSignupCounts = await attachPublicEventSignupCounts(supabase, golfOnly);
        const mapped = withSignupCounts.map((row) => ({
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
          <SportEventCard
            key={item.id ?? idx}
            title={item.title}
            image={item.image}
            dateLabel={primaryTimeLabel(item)}
            location={item.location}
            signupLabel={formatEventSignupLabel(item.signup_count, item.registration_limit, item.signup_unit)}
            description={item.description}
            onOpen={() => setDetailEvent(item)}
            actions={
              <>
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
              </>
            }
          />
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
        id="golf-hero"
        eyebrow="Golf"
        title="Play Golf with Aldrich"
        description="Tournament events for every level."
        headingLevel="h1"
        className="soccer-hero"
      >
        <div className="soccer-hero__grid">
          <div className="soccer-hero__copy">
            <div className="cta-row">
              <Link className="button primary" href="#tournaments">
                Tournaments
              </Link>
            </div>
          </div>
          <div className="soccer-hero__logo">
            <Image src="/ASLLogo.png" alt="ASL Logo" fill sizes="140px" priority />
          </div>
        </div>
      </Section>

      <Section
        id="tournaments"
        eyebrow="Tournaments"
        title="Tournament Play"
        description="Golf tournament events."
        headingLevel="h2"
        className="soccer-section"
      >
        {loadingEvents ? <p className="muted">Loading tournaments...</p> : renderCards(events)}
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
