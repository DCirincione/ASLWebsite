"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
import { isRegularAslSundayLeagueEvent, SUNDAY_LEAGUE_HREF } from "@/lib/sunday-league";
import { useRegisteredEventIds } from "@/lib/supabase/use-registered-program-slugs";
import type { Event, Sport } from "@/lib/supabase/types";

type SportEvent = Event & PublicEventSignupStats & { image?: string };
type EventBucket = "clinic" | "league" | "pickup" | "tournament" | "other";

const bucketFromSlug = (registrationSlug?: string | null): EventBucket => {
  const value = (registrationSlug ?? "").trim().toLowerCase();

  if (value.startsWith("soccer-clinic")) return "clinic";
  if (value.startsWith("soccer-league")) return "league";
  if (value.startsWith("soccer-pickup")) return "pickup";
  if (value.startsWith("soccer-tournament")) return "tournament";

  return "other";
};

export default function SoccerPage() {
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
        const soccerOnly = filterVisiblePublicEvents(data as Event[]).filter((row) =>
          sportMatchesEvent(row, "soccer", sports) &&
          ["soccer-clinic", "soccer-league", "soccer-pickup", "soccer-tournament", "soccer-event"].some((prefix) =>
            (row.registration_program_slug ?? "").trim().toLowerCase().startsWith(prefix)
          )
        );
        const withSignupCounts = await attachPublicEventSignupCounts(supabase, soccerOnly);
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
        {list.map((item, idx) => {
          const isSundayLeague = isRegularAslSundayLeagueEvent(item);

          return (
            <SportEventCard
              key={item.id ?? idx}
              title={item.title}
              image={item.image}
              dateLabel={primaryTimeLabel(item)}
              location={item.location}
              signupLabel={formatEventSignupLabel(item.signup_count, item.registration_limit)}
              description={item.description}
              onOpen={isSundayLeague ? undefined : () => setDetailEvent(item)}
              actions={
                <>
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
                      <button
                        className="button ghost"
                        type="button"
                        onClick={() => setDetailEvent(item)}
                      >
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
                  )}
                </>
              }
            />
          );
        })}
      </div>
    );
  };

  return (
    <PageShell>
      <div style={{ paddingTop: 16 }}>
        <HistoryBackButton label="← Back" fallbackHref="/sports" />
      </div>
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
              <Link className="button ghost" href="#tournaments">
                Tournaments
              </Link>
              <Link className="button ghost" href="#events">
                Events
              </Link>
            </div>
          </div>
          <div className="soccer-hero__logo">
            <Image src="/sports_images/soccer/soccerLogoTest.png" alt="Aldrich Soccer" fill sizes="140px" priority />
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
        {loadingEvents ? <p className="muted">Loading clinics...</p> : renderCards(byType.clinics)}
      </Section>

      <Section
        id="join"
        eyebrow="Leagues"
        title="League Play"
        description="Pick your format and night. Captains can register teams or add free agents."
        headingLevel="h2"
        className="soccer-section"
      >
        {loadingEvents ? <p className="muted">Loading leagues...</p> : renderCards(byType.leagues)}
      </Section>

      <Section
        id="pickup"
        eyebrow="Pickup"
        title="Pickup Sessions"
        description="Weekly runs with a host, pinnies, and rotating teams."
        headingLevel="h2"
        className="soccer-section"
      >
        {loadingEvents ? <p className="muted">Loading pickup...</p> : renderCards(byType.pickup)}
      </Section>

      <Section
        id="tournaments"
        eyebrow="Tournaments"
        title="Tournament Play"
        description="Weekend cups, showcases, and knockout brackets."
        headingLevel="h2"
        className="soccer-section"
      >
        {loadingEvents ? <p className="muted">Loading tournaments...</p> : renderCards(byType.tournaments)}
      </Section>

      <Section
        id="events"
        eyebrow="Events"
        title="Featured Soccer Events"
        description="One-off showcases and community soccer days."
        headingLevel="h2"
        className="sport-event-section"
      >
        {loadingEvents ? <p className="muted">Loading events...</p> : null}
        {!loadingEvents && events.length === 0 ? <p className="muted">No soccer events yet. Check back soon.</p> : null}
        {!loadingEvents && events.length > 0 ? (
          <div className="sport-event-list">
            {events.map((ev) => {
              const isSundayLeague = isRegularAslSundayLeagueEvent(ev);

              return (
                <SportEventCard
                  key={ev.id}
                  title={ev.title}
                  image={ev.image}
                  dateLabel={primaryTimeLabel(ev)}
                  location={ev.location}
                  signupLabel={formatEventSignupLabel(ev.signup_count, ev.registration_limit)}
                  description={ev.description}
                  onOpen={isSundayLeague ? undefined : () => setDetailEvent(ev)}
                  actions={
                    <>
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
                          <button
                            className="button ghost"
                            type="button"
                            onClick={() => setDetailEvent(ev)}
                          >
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
                        </>
                      )}
                    </>
                  }
                />
              );
            })}
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
