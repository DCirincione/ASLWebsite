"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { RegistrationModal } from "@/components/registration-modal";
import { Section } from "@/components/section";
import { supabase } from "@/lib/supabase/client";
import type { Event, Soccer } from "@/lib/supabase/types";

type SportEvent = Event & { image?: string };
type SoccerCard = Soccer & { image?: string };

const fallbackSoccer: SoccerCard[] = [];
const imageFallbacks = ["/forever5/newman5.png", "/basketball/champst2025.jpeg", "/PickleTourneyCourt6.png"];

export default function SoccerPage() {
  const [soccerItems, setSoccerItems] = useState<SoccerCard[]>(fallbackSoccer);
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [loadingSoccer, setLoadingSoccer] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSlug, setModalSlug] = useState<string | null>(null);
  const [modalTitle, setModalTitle] = useState<string | null>(null);

  useEffect(() => {
    const loadSoccer = async () => {
      if (!supabase) return;
      setLoadingSoccer(true);
      const { data, error } = await supabase
        .from("soccer")
        .select("id,title,type,start_date,end_date,time_info,location,description,cta_label,cta_url,image_url,level");
      if (!error && data) {
        const mapped = (data as Soccer[]).map((row, idx) => ({
          ...row,
          image: row.image_url || imageFallbacks[idx % imageFallbacks.length],
        }));
        setSoccerItems(mapped);
      }
      setLoadingSoccer(false);
    };
    const loadEvents = async () => {
      if (!supabase) return;
      setLoadingEvents(true);
      const { data, error } = await supabase
        .from("events")
        .select("id,title,start_date,end_date,time_info,location,description,status,registration_program_slug,image_url,sport_slug")
        .order("start_date", { ascending: true, nullsFirst: false });
      if (!error && data) {
        const filtered = (data as Event[]).filter((row) => row.sport_slug === "soccer");
        const fallbackAll = filtered.length > 0 ? filtered : (data as Event[]);
        const mapped = fallbackAll.map((row) => ({
          ...row,
          image: row.image_url || undefined,
        }));
        setEvents(mapped);
      }
      setLoadingEvents(false);
    };
    loadSoccer();
    loadEvents();
  }, []);

  const byType = useMemo(() => {
    const clinics = soccerItems.filter((i) => i.type === "clinic");
    const leagues = soccerItems.filter((i) => i.type === "league");
    const pickup = soccerItems.filter((i) => i.type === "pickup");
    return { clinics, leagues, pickup };
  }, [soccerItems]);

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

  const openModal = (slug?: string | null, title?: string) => {
    if (!slug) return;
    setModalSlug(slug);
    setModalTitle(title ?? null);
    setModalOpen(true);
  };

  const renderCards = (list: SoccerCard[]) => {
    if (!list || list.length === 0) {
      return <p className="muted">No items posted yet.</p>;
    }
    return (
      <div className="list list--grid">
        {list.map((item, idx) => (
          <article key={item.id ?? idx} className="soccer-card">
            <div className="soccer-card__media">
              <img src={item.image || imageFallbacks[idx % imageFallbacks.length]} alt="" />
            </div>
            <div className="soccer-card__body">
              <p className="list__title">{item.title}</p>
              <p className="muted">
                {[item.time_info, item.location, item.level].filter(Boolean).join(" • ")}
              </p>
              <p className="muted">{item.description}</p>
              <div className="cta-row">
                {item.cta_url ? (
                  <Link className="button primary" href={item.cta_url}>
                    {item.cta_label ?? "Details"}
                  </Link>
                ) : null}
                <Link className="button ghost" href="/community">
                  Find teammates
                </Link>
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
        id="soccer-hero"
        eyebrow="Soccer"
        title="Play Soccer with Aldrich"
        description="Leagues, pickup, and tournaments for every level. Form a team or jump into weekly runs."
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
              <Link className="button ghost" href="#events">
                Events & Tournaments
              </Link>
            </div>
          </div>
          <div className="soccer-hero__logo">
            <Image
              src="/sports_images/soccer/soccerLogoTest.png"
              alt="Aldrich Soccer"
              fill
              priority
            />
          </div>
        </div>
      </Section>

      <Section
        id="clinics"
        eyebrow="Clinics"
        title="Skill Clinics"
        description="Targeted, small-sided sessions led by Aldrich coaches."
        headingLevel="h2"
        className="soccer-section"
      >
        {loadingSoccer ? <p className="muted">Loading clinics...</p> : renderCards(byType.clinics)}
      </Section>

      <Section
        id="join"
        eyebrow="Leagues"
        title="League Play"
        description="Pick your format and night. Captains can register teams or add free agents."
        headingLevel="h2"
        className="soccer-section"
      >
        {loadingSoccer ? <p className="muted">Loading leagues...</p> : renderCards(byType.leagues)}
      </Section>

      <Section
        id="pickup"
        eyebrow="Pickup"
        title="Pickup Sessions"
        description="Weekly runs with a host, pinnies, and rotating teams."
        headingLevel="h2"
        className="soccer-section"
      >
        {loadingSoccer ? <p className="muted">Loading pickup...</p> : renderCards(byType.pickup)}
      </Section>

      <Section
        id="events"
        eyebrow="Events"
        title="Events & Tournaments"
        description="Soccer tournaments, leagues, and showcases."
        headingLevel="h2"
        className="sport-event-section"
      >
        {loadingEvents ? <p className="muted">Loading events...</p> : null}
        {!loadingEvents && events.length === 0 ? (
          <p className="muted">No soccer events yet. Check back soon.</p>
        ) : null}
        {!loadingEvents && events.length > 0 ? (
          <div className="sport-event-list">
            {events.map((ev) => (
              <article key={ev.id} className="sport-event-card">
                <div className="sport-event-card__body">
                  <p className="eyebrow">Soccer</p>
                  <h3>{ev.title}</h3>
                  <p className="sport-event__meta">
                    <span>{ev.location || "Location TBD"}</span>
                    <span>•</span>
                    <span>{ev.time_info || formatDate(ev.start_date)}</span>
                  </p>
                  <p className="muted">{ev.description || "Details coming soon."}</p>
                  <div className="sport-event__actions">
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
                    <img src={ev.image} alt="" />
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
    </PageShell>
  );
}
