"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { EventDetailModal } from "@/components/event-detail-modal";
import { PageShell } from "@/components/page-shell";
import { RegistrationModal } from "@/components/registration-modal";
import { Section } from "@/components/section";
import { supabase } from "@/lib/supabase/client";
import type { Event } from "@/lib/supabase/types";

type SportEvent = Event & { image?: string };
type EventBucket = "clinic" | "league" | "other";

const imageFallbacks = ["/sports_images/soccer/soccerLogo.png", "/sports_images/soccer/soccerLogoTest.png", "/ASLLogo.png"];

const bucketFromSlug = (registrationSlug?: string | null): EventBucket => {
  const value = (registrationSlug ?? "").trim().toLowerCase();

  if (value.startsWith("youth-soccer-clinic")) return "clinic";
  if (value.startsWith("youth-soccer-league")) return "league";

  return "other";
};

export default function YouthSoccerPage() {
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSlug, setModalSlug] = useState<string | null>(null);
  const [modalTitle, setModalTitle] = useState<string | null>(null);
  const [detailEvent, setDetailEvent] = useState<SportEvent | null>(null);

  useEffect(() => {
    const loadEvents = async () => {
      if (!supabase) return;
      setLoadingEvents(true);
      const { data, error } = await supabase
        .from("events")
        .select("id,title,start_date,end_date,time_info,location,description,registration_program_slug,image_url")
        .order("start_date", { ascending: true, nullsFirst: false });

      if (!error && data) {
        const youthSoccerOnly = (data as Event[]).filter((row) => {
          const slug = (row.registration_program_slug ?? "").trim().toLowerCase();
          return slug.startsWith("youth-soccer-clinic") || slug.startsWith("youth-soccer-league");
        });

        const mapped = youthSoccerOnly.map((row, idx) => ({
          ...row,
          image: row.image_url || imageFallbacks[idx % imageFallbacks.length],
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
    const clinics = events.filter((ev) => bucketFromSlug(ev.registration_program_slug) === "clinic");
    const leagues = events.filter((ev) => bucketFromSlug(ev.registration_program_slug) === "league");
    return { clinics, leagues };
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

  const openModal = (slug?: string | null, title?: string) => {
    if (!slug) return;
    setModalSlug(slug);
    setModalTitle(title ?? null);
    setModalOpen(true);
  };

  const primaryTimeLabel = (event: SportEvent) => {
    const time = event.time_info?.trim();
    return time || formatDateRange(event.start_date, event.end_date) || "Date TBD";
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
              <Image
                src={item.image || imageFallbacks[idx % imageFallbacks.length]}
                alt=""
                fill
                sizes="(max-width: 900px) 100vw, 33vw"
              />
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
                  disabled={!item.registration_program_slug}
                  onClick={() => openModal(item.registration_program_slug, item.title)}
                >
                  {item.registration_program_slug ? "Sign up" : "Registration coming soon"}
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
      <Section
        id="youth-soccer-hero"
        eyebrow="Youth Soccer"
        title="Youth Soccer with Aldrich"
        description="Youth league and clinic programs focused on development, reps, and team play."
        headingLevel="h1"
        className="soccer-hero"
      >
        <div className="soccer-hero__grid">
          <div className="soccer-hero__copy">
            <div className="cta-row">
              <Link className="button primary" href="#clinics">
                Clinics
              </Link>
              <Link className="button ghost" href="#leagues">
                Leagues
              </Link>
              <Link className="button ghost" href="#events">
                Events
              </Link>
            </div>
          </div>
          <div className="soccer-hero__logo">
            <Image src="/sports_images/soccer/soccerLogoTest.png" alt="Aldrich Youth Soccer" fill priority />
          </div>
        </div>
      </Section>

      <Section
        id="clinics"
        eyebrow="Clinics"
        title="Youth Clinics"
        description="Fundamentals, first touch, and confidence-building sessions for youth players."
        headingLevel="h2"
        className="soccer-section"
      >
        {loadingEvents ? <p className="muted">Loading clinics...</p> : renderCards(byType.clinics)}
      </Section>

      <Section
        id="leagues"
        eyebrow="Leagues"
        title="Youth League Play"
        description="Season play by age group with structured game days and coaches."
        headingLevel="h2"
        className="soccer-section"
      >
        {loadingEvents ? <p className="muted">Loading leagues...</p> : renderCards(byType.leagues)}
      </Section>

      <Section
        id="events"
        eyebrow="Events"
        title="Featured Youth Soccer Events"
        description="Clinic and league highlights for the youth soccer calendar."
        headingLevel="h2"
        className="sport-event-section"
      >
        {loadingEvents ? <p className="muted">Loading events...</p> : null}
        {!loadingEvents && events.length === 0 ? <p className="muted">No youth soccer events yet. Check back soon.</p> : null}
        {!loadingEvents && events.length > 0 ? (
          <div className="sport-event-list">
            {events.map((ev, idx) => (
              <article key={ev.id} className="sport-event-card">
                <div className="sport-event-card__body">
                  <p className="eyebrow">Youth Soccer</p>
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
                      disabled={!ev.registration_program_slug}
                      onClick={() => openModal(ev.registration_program_slug, ev.title)}
                    >
                      {ev.registration_program_slug ? "Sign up" : "Registration coming soon"}
                    </button>
                  </div>
                </div>
                <div className="sport-event-card__media">
                  <Image
                    src={ev.image || imageFallbacks[idx % imageFallbacks.length]}
                    alt=""
                    width={480}
                    height={300}
                    sizes="(max-width: 960px) 100vw, 320px"
                  />
                </div>
              </article>
            ))}
          </div>
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
        dateLabel={detailEvent ? primaryTimeLabel(detailEvent) : undefined}
        onClose={() => setDetailEvent(null)}
        onRegister={(event) => openModal(event.registration_program_slug, event.title)}
      />
    </PageShell>
  );
}
