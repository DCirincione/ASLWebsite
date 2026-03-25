"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { EventDetailModal } from "@/components/event-detail-modal";
import { HistoryBackButton } from "@/components/history-back-button";
import { PageShell } from "@/components/page-shell";
import { RegistrationModal } from "@/components/registration-modal";
import { Section } from "@/components/section";
import { getSignupActionLabel, getSignupSubmittedLabel, getSignupUnavailableLabel } from "@/lib/event-signups";
import { getEventSectionLabel, normalizeSportSlug, parseSportSectionHeaders, slugifySportValue, sportMatchesEvent } from "@/lib/sports";
import { supabase } from "@/lib/supabase/client";
import { isRegularAslSundayLeagueEvent, SUNDAY_LEAGUE_HREF } from "@/lib/sunday-league";
import { useRegisteredEventIds } from "@/lib/supabase/use-registered-program-slugs";
import type { Event, Sport } from "@/lib/supabase/types";

type SportEvent = Event & { image?: string };

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

export default function DynamicSportPage() {
  const params = useParams<{ slug: string }>();
  const routeSlug = slugifySportValue(params?.slug ?? "");
  const [sport, setSport] = useState<Sport | null>(null);
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalEventId, setModalEventId] = useState<string | null>(null);
  const [modalTitle, setModalTitle] = useState<string | null>(null);
  const [detailEvent, setDetailEvent] = useState<SportEvent | null>(null);
  const { isRegisteredEvent, refreshRegisteredEvents } = useRegisteredEventIds();

  useEffect(() => {
    const loadSportPage = async () => {
      if (!routeSlug) {
        setLoading(false);
        return;
      }
      if (!supabase) {
        setLoading(false);
        return;
      }
      setLoading(true);

      const [{ data: sportsData, error: sportsError }, { data: eventsData, error: eventsError }] = await Promise.all([
        supabase.from("sports").select("*").order("title", { ascending: true }),
        supabase
          .from("events")
          .select("id,title,start_date,end_date,time_info,location,description,signup_mode,registration_program_slug,image_url,registration_enabled")
          .order("start_date", { ascending: true, nullsFirst: false }),
      ]);

      if (sportsError || eventsError) {
        setSport(null);
        setEvents([]);
        setLoading(false);
        return;
      }

      const matchedSport =
        ((sportsData ?? []) as Sport[]).find((entry) => normalizeSportSlug(entry) === routeSlug) ?? null;

      if (!matchedSport) {
        setSport(null);
        setEvents([]);
        setLoading(false);
        return;
      }

      const sportSlug = normalizeSportSlug(matchedSport);
      const matchedEvents = ((eventsData ?? []) as Event[])
        .filter((event) => sportMatchesEvent(event, sportSlug))
        .map((event) => ({
          ...event,
          image: event.image_url || undefined,
        }));

      setSport(matchedSport);
      setEvents(matchedEvents);
      setLoading(false);
    };

    void loadSportPage();
  }, [routeSlug]);

  const sectionHeaders = parseSportSectionHeaders(sport?.section_headers);
  const sections = useMemo(() => {
    const normalizedSportSlug = normalizeSportSlug(sport);
    return sectionHeaders.map((label) => ({
      label,
      id: slugifySportValue(label),
      events: events.filter((event) => getEventSectionLabel(event, normalizedSportSlug, sectionHeaders) === label),
    }));
  }, [events, sectionHeaders, sport]);

  const primaryTimeLabel = (event: SportEvent) => {
    const time = event.time_info?.trim();
    const dateRange = formatDateRange(event.start_date, event.end_date);
    if (dateRange && time) return `${dateRange} • ${time}`;
    return dateRange || time || "Date TBD";
  };

  const openModal = (eventId?: string | null, title?: string) => {
    const normalizedEventId = eventId?.trim();
    if (!normalizedEventId || isRegisteredEvent(normalizedEventId)) return;
    setDetailEvent(null);
    setModalEventId(normalizedEventId);
    setModalTitle(title ?? null);
    setModalOpen(true);
  };

  const renderCards = (list: SportEvent[], emptyMessage: string) => {
    if (list.length === 0) {
      return <p className="muted">{emptyMessage}</p>;
    }

    return (
      <div className="list list--grid">
        {list.map((item) => {
          const isSundayLeague = isRegularAslSundayLeagueEvent(item);

          return (
            <article key={item.id} className="soccer-card">
              <div className="soccer-card__media">
                {item.image ? (
                  <Image src={item.image} alt="" fill sizes="(max-width: 900px) 100vw, 33vw" />
                ) : null}
              </div>
              <div className="soccer-card__body">
                <p className="list__title">{item.title}</p>
                <p className="muted">{primaryTimeLabel(item)}</p>
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
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  const renderFeaturedCards = (list: SportEvent[], sportTitle: string) => {
    if (list.length === 0) {
      return <p className="muted">No {sportTitle.toLowerCase()} events yet.</p>;
    }

    return (
      <div className="sport-event-list">
        {list.map((event) => {
          const isSundayLeague = isRegularAslSundayLeagueEvent(event);

          return (
            <article key={event.id} className="sport-event-card">
              {event.image ? (
                <div className="sport-event-card__media">
                  <Image src={event.image} alt="" width={200} height={130} />
                </div>
              ) : null}
              <div className="sport-event-card__body">
                <p className="eyebrow">{sportTitle}</p>
                <h3>{event.title}</h3>
                <p className="sport-event__meta">
                  <span>{primaryTimeLabel(event)}</span>
                </p>
                <div className="sport-event__actions">
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
                        disabled={!event.registration_enabled || isRegisteredEvent(event.id)}
                        onClick={() => openModal(event.id, event.title)}
                      >
                        {!event.registration_enabled ? getSignupUnavailableLabel(event) : isRegisteredEvent(event.id) ? getSignupSubmittedLabel(event) : getSignupActionLabel(event)}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  if (!routeSlug) {
    return null;
  }

  if (loading) {
    return (
      <PageShell>
        <div style={{ paddingTop: 16 }}>
          <HistoryBackButton label="← Back" fallbackHref="/sports" />
        </div>
        <Section title="Loading" headingLevel="h2" showHeader={false}>
          <p className="muted">Loading sport page...</p>
        </Section>
      </PageShell>
    );
  }

  if (!sport) {
    return (
      <PageShell>
        <div style={{ paddingTop: 16 }}>
          <HistoryBackButton label="← Back" fallbackHref="/sports" />
        </div>
        <Section
          eyebrow="Sports"
          title="Sport Not Found"
          description="This sport page has not been created yet."
          headingLevel="h1"
        >
          <Link className="button primary" href="/sports">
            Back to Sports
          </Link>
        </Section>
      </PageShell>
    );
  }

  const sportSlug = normalizeSportSlug(sport);
  const heroDescription =
    sport?.short_description?.trim() ||
    "Browse active leagues, events, and registration options for this sport.";
  const heroImage = sportSlug === "soccer" ? sport?.image_url?.trim() || "/sports_images/soccer/soccerLogoTest.png" : "/ASLLogo.png";
  const heroAlt = sportSlug === "soccer" ? sport?.title ?? "Soccer" : "ASL Logo";

  return (
    <PageShell>
      <div style={{ paddingTop: 16 }}>
        <HistoryBackButton label="← Back" fallbackHref="/sports" />
      </div>
      <Section
        id={`${sportSlug}-hero`}
        eyebrow={sport?.title ?? "Sport"}
        title={`Play ${sport?.title ?? "This Sport"} with Aldrich`}
        description={heroDescription}
        headingLevel="h1"
        className="soccer-hero"
      >
        <div className="soccer-hero__grid">
          <div className="soccer-hero__copy">
            <div className="cta-row">
              {sections.map((section, index) => (
                <Link key={section.id} className={`button ${index === 0 ? "primary" : "ghost"}`} href={`#${section.id}`}>
                  {section.label}
                </Link>
              ))}
              {events.length > 0 ? (
                <Link className={`button ${sections.length === 0 ? "primary" : "ghost"}`} href="#events">
                  Events
                </Link>
              ) : null}
            </div>
            <div className="event-card__meta" style={{ marginTop: 20 }}>
              {sport?.players_per_team ? <p className="muted">Players per team: {sport.players_per_team}</p> : null}
              {sport?.gender ? <p className="muted">Gender: {sport.gender}</p> : null}
            </div>
          </div>
          <div className="soccer-hero__logo">
            <Image src={heroImage} alt={heroAlt} fill priority />
          </div>
        </div>
      </Section>

      {sections.map((section) => (
        <Section
          key={section.id}
          id={section.id}
          eyebrow={section.label}
          title={section.label}
          description={`${sport?.title ?? "Sport"} ${section.label.toLowerCase()}.`}
          headingLevel="h2"
          className="soccer-section"
        >
          {renderCards(section.events, `No ${section.label.toLowerCase()} posted yet.`)}
        </Section>
      ))}

      {events.length > 0 ? (
        <Section
          id="events"
          eyebrow="Events"
          title={`Featured ${sport?.title ?? "Sport"} Events`}
          description={`More ${sport?.title?.toLowerCase() ?? "sport"} events and signups.`}
          headingLevel="h2"
          className="sport-event-section"
        >
          {renderFeaturedCards(events, sport?.title ?? "Sport")}
        </Section>
      ) : null}

      {sections.length === 0 && events.length === 0 ? (
        <Section title="No Events Yet" headingLevel="h2" className="soccer-section">
          <p className="muted">No events are connected to this sport yet. Add events with registration slugs that start with `{sportSlug}-...`.</p>
        </Section>
      ) : null}

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
