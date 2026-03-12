"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { EventDetailModal } from "@/components/event-detail-modal";
import { PageShell } from "@/components/page-shell";
import { RegistrationModal } from "@/components/registration-modal";
import { Section } from "@/components/section";
import { supabase } from "@/lib/supabase/client";
import { useRegisteredProgramSlugs } from "@/lib/supabase/use-registered-program-slugs";
import type { Event } from "@/lib/supabase/types";

type SportEvent = Event & { image?: string };

export default function GolfPage() {
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSlug, setModalSlug] = useState<string | null>(null);
  const [modalTitle, setModalTitle] = useState<string | null>(null);
  const [detailEvent, setDetailEvent] = useState<SportEvent | null>(null);
  const { isRegisteredSlug, refreshRegisteredSlugs } = useRegisteredProgramSlugs();

  useEffect(() => {
    const loadEvents = async () => {
      if (!supabase) return;
      setLoadingEvents(true);
      const { data, error } = await supabase
        .from("events")
        .select("id,title,start_date,end_date,time_info,location,description,registration_program_slug,image_url")
        .order("start_date", { ascending: true, nullsFirst: false });

      if (!error && data) {
        const golfOnly = (data as Event[]).filter((row) =>
          (row.registration_program_slug ?? "").trim().toLowerCase().startsWith("golf-tournament")
        );
        const mapped = golfOnly.map((row) => ({
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

  const openModal = (slug?: string | null, title?: string) => {
    const normalizedSlug = slug?.trim();
    if (!normalizedSlug || isRegisteredSlug(normalizedSlug)) return;
    setModalSlug(normalizedSlug);
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
              {item.image ? (
                <Image src={item.image} alt="" fill sizes="(max-width: 900px) 100vw, 33vw" />
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
                  disabled={!item.registration_program_slug || isRegisteredSlug(item.registration_program_slug)}
                  onClick={() => openModal(item.registration_program_slug, item.title)}
                >
                  {!item.registration_program_slug ? "Registration coming soon" : isRegisteredSlug(item.registration_program_slug) ? "Registered" : "Sign up"}
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
            <Image src="/golf/golf.jpg" alt="Aldrich Golf" fill priority />
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
        programSlug={modalSlug}
        contextTitle={modalTitle ?? undefined}
        onClose={() => setModalOpen(false)}
        onSubmitted={refreshRegisteredSlugs}
      />
      <EventDetailModal
        open={Boolean(detailEvent)}
        event={detailEvent}
        dateLabel={detailEvent ? primaryTimeLabel(detailEvent) : undefined}
        isRegistered={isRegisteredSlug(detailEvent?.registration_program_slug)}
        onClose={() => setDetailEvent(null)}
        onRegister={(event) => openModal(event.registration_program_slug, event.title)}
      />
    </PageShell>
  );
}
