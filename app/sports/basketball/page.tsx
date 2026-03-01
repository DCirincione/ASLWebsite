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
type EventBucket = "clinic" | "league" | "pickup" | "tournament" | "other";

const imageFallbacks = ["/basketball/champst2025.jpeg", "/forever5/newman5.png", "/PickleTourneyCourt6.png"];

const bucketFromSlug = (registrationSlug?: string | null): EventBucket => {
  const value = (registrationSlug ?? "").trim().toLowerCase();

  if (value.startsWith("basketball-clinic")) return "clinic";
  if (value.startsWith("basketball-league")) return "league";
  if (value.startsWith("basketball-pickup")) return "pickup";
  if (value.startsWith("basketball-tournament")) return "tournament";

  return "other";
};

export default function BasketballPage() {
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
        const basketballOnly = (data as Event[]).filter((row) =>
          (row.registration_program_slug ?? "").trim().toLowerCase().startsWith("basketball-")
        );
        const mapped = basketballOnly.map((row) => ({
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
    const clinics = events.filter((ev) => bucketFromSlug(ev.registration_program_slug) === "clinic");
    const leagues = events.filter((ev) => bucketFromSlug(ev.registration_program_slug) === "league");
    const pickup = events.filter((ev) => bucketFromSlug(ev.registration_program_slug) === "pickup");
    const tournaments = events.filter((ev) => bucketFromSlug(ev.registration_program_slug) === "tournament");
    return { clinics, leagues, pickup, tournaments };
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
        id="basketball-hero"
        eyebrow="Basketball"
        title="Play Basketball with Aldrich"
        description="Leagues, pickup, and tournaments for every level. Build your squad or join a run."
        headingLevel="h1"
        className="soccer-hero"
      >
        <div className="soccer-hero__grid">
          <div className="soccer-hero__copy">
            <div className="cta-row">
              <Link className="button primary" href="#clinics">
                Clinics
              </Link>
              <Link className="button ghost" href="#join">
                Leagues
              </Link>
              <Link className="button ghost" href="#pickup">
                Pickup
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
            <Image src="/basketball/champst2025.jpeg" alt="Aldrich Basketball" fill priority />
          </div>
        </div>
      </Section>

      <Section
        id="clinics"
        eyebrow="Clinics"
        title="Skill Clinics"
        description="Position-specific sessions and game-speed reps led by Aldrich coaches."
        headingLevel="h2"
        className="soccer-section"
      >
        {loadingEvents ? <p className="muted">Loading clinics...</p> : renderCards(byType.clinics)}
      </Section>

      <Section
        id="join"
        eyebrow="Leagues"
        title="League Play"
        description="Join seasonal leagues and register full teams or free agents."
        headingLevel="h2"
        className="soccer-section"
      >
        {loadingEvents ? <p className="muted">Loading leagues...</p> : renderCards(byType.leagues)}
      </Section>

      <Section
        id="pickup"
        eyebrow="Pickup"
        title="Pickup Runs"
        description="Consistent weekly runs with organized rotations and hosts."
        headingLevel="h2"
        className="soccer-section"
      >
        {loadingEvents ? <p className="muted">Loading pickup...</p> : renderCards(byType.pickup)}
      </Section>

      <Section
        id="tournaments"
        eyebrow="Tournaments"
        title="Tournament Play"
        description="Weekend brackets, showcase games, and championship runs."
        headingLevel="h2"
        className="soccer-section"
      >
        {loadingEvents ? <p className="muted">Loading tournaments...</p> : renderCards(byType.tournaments)}
      </Section>

      <Section
        id="events"
        eyebrow="Events"
        title="Featured Basketball Events"
        description="One-off showcases and community basketball days."
        headingLevel="h2"
        className="sport-event-section"
      >
        {loadingEvents ? <p className="muted">Loading events...</p> : null}
        {!loadingEvents && events.length === 0 ? (
          <p className="muted">No basketball events yet. Check back soon.</p>
        ) : null}
        {!loadingEvents && events.length > 0 ? (
          <div className="sport-event-list">
            {events.map((ev) => (
              <article key={ev.id} className="sport-event-card">
                <div className="sport-event-card__body">
                  <p className="eyebrow">Basketball</p>
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
                {ev.image ? (
                  <div className="sport-event-card__media">
                    <Image src={ev.image} alt="" width={480} height={300} sizes="(max-width: 960px) 100vw, 320px" />
                  </div>
                ) : null}
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
