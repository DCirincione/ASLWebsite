"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { EventDetailModal } from "@/components/event-detail-modal";
import { PageShell } from "@/components/page-shell";
import { RegistrationModal } from "@/components/registration-modal";
import { Section } from "@/components/section";
import { getSignupActionLabel, getSignupSubmittedLabel, getSignupUnavailableLabel } from "@/lib/event-signups";
import { supabase } from "@/lib/supabase/client";
import { useRegisteredEventIds } from "@/lib/supabase/use-registered-program-slugs";
import type { Event } from "@/lib/supabase/types";

type SportEvent = Event & { image?: string };

export default function RunClubPage() {
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [runClubFlyer, setRunClubFlyer] = useState("/ASLLogo.png");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalEventId, setModalEventId] = useState<string | null>(null);
  const [modalTitle, setModalTitle] = useState<string | null>(null);
  const [detailEvent, setDetailEvent] = useState<SportEvent | null>(null);
  const { isRegisteredEvent, refreshRegisteredEvents } = useRegisteredEventIds();

  useEffect(() => {
    const normalize = (value?: string | null) => (value ?? "").trim().toLowerCase();
    const toFlyerCandidates = (slug?: string | null) => {
      const normalized = normalize(slug);
      if (!normalized) return [];

      const candidates = new Set<string>();
      candidates.add(normalized);
      candidates.add(`${normalized}-flyer`);

      const suffixes = ["-league", "-clinic", "-pickup", "-tournament", "-event"];
      for (const suffix of suffixes) {
        if (normalized.endsWith(suffix)) {
          const base = normalized.slice(0, -suffix.length);
          if (base) {
            candidates.add(base);
            candidates.add(`${base}-flyer`);
          }
        }
      }

      return Array.from(candidates);
    };

    const loadFlyer = async () => {
      if (!supabase) return;

      const { data, error } = await supabase.from("flyers").select("*");
      if (error || !data || data.length === 0) return;

      const rows = data as Array<{
        flyer_name?: string | null;
        flyer_image_url?: string | null;
        image_url?: string | null;
      }>;

      const candidates = toFlyerCandidates("run-club");
      const flyer =
        rows.find((row) => candidates.includes(normalize(row.flyer_name))) ||
        rows.find((row) => normalize(row.flyer_name) === "run club") ||
        null;

      const flyerUrl = flyer?.flyer_image_url?.trim() || flyer?.image_url?.trim();
      if (flyerUrl) {
        setRunClubFlyer(flyerUrl);
      }
    };

    void loadFlyer();
  }, []);

  useEffect(() => {
    const loadEvents = async () => {
      if (!supabase) return;
      setLoadingEvents(true);
      const { data, error } = await supabase
        .from("events")
        .select("id,title,start_date,end_date,time_info,location,description,signup_mode,registration_program_slug,image_url,registration_enabled")
        .order("start_date", { ascending: true, nullsFirst: false });

      if (!error && data) {
        const runClubOnly = (data as Event[]).filter(
          (row) => (row.registration_program_slug ?? "").trim().toLowerCase() === "run-club"
        );
        const mapped = runClubOnly.map((row) => ({
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

  const renderCards = () => {
    if (!events || events.length === 0) {
      return <p className="muted">No runs posted yet.</p>;
    }

    return (
      <div className="list list--grid">
        {events.map((item, idx) => (
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
      <Section
        id="run-club-hero"
        eyebrow="Run Club"
        title="Run with Aldrich"
        description="Weekly group runs and training sessions for all paces."
        headingLevel="h1"
        className="soccer-hero"
      >
        <div className="soccer-hero__grid">
          <div className="soccer-hero__copy">
            <div className="cta-row">
              <Link className="button primary" href="#runs">
                Runs
              </Link>
            </div>
          </div>
          <div className="soccer-hero__logo">
            <Image src="/ASLLogo.png" alt="Aldrich Run Club" fill priority />
          </div>
        </div>
      </Section>

      <Section
        id="runs"
        eyebrow="Runs"
        title="Runs"
        description="Scheduled run club sessions."
        headingLevel="h2"
        className="soccer-section"
      >
        {loadingEvents ? <p className="muted">Loading runs...</p> : renderCards()}
        <div className="run-club-overview">
          <div className="run-club-overview__flyer">
            <Image
              src={runClubFlyer}
              alt="Run Club Flyer"
              width={420}
              height={560}
              sizes="(max-width: 900px) 100vw, 360px"
            />
          </div>
          <div className="run-club-overview__copy">
            <p className="eyebrow">About Run Club</p>
            <h3>What Run Club Is About</h3>
            <p className="muted">
              Aldrich Run Club is built for all paces and experience levels. We meet for structured group runs that
              focus on consistency, encouragement, and community. Whether you are training for your first 5K or
              building a weekly routine, this is a place to stay accountable and run with a supportive crew.
            </p>
          </div>
        </div>
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
