"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getSignupActionLabel, getSignupSubmittedLabel, getSignupUnavailableLabel } from "@/lib/event-signups";
import { isRegularAslSundayLeagueEvent } from "@/lib/sunday-league";
import { supabase } from "@/lib/supabase/client";
import type { JsonValue } from "@/lib/supabase/types";

type EventDetail = {
  id: string;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  time_info?: string | null;
  location?: string | null;
  description?: string | null;
  host_type?: "aldrich" | "featured" | "partner" | "other" | null;
  image_url?: string | null;
  signup_mode?: "registration" | "waitlist" | null;
  registration_program_slug?: string | null;
  registration_enabled?: boolean | null;
  image?: string | null;
};

type EventDetailModalProps = {
  open: boolean;
  event: EventDetail | null;
  dateLabel?: string;
  isRegistered?: boolean;
  onClose: () => void;
  onRegister?: (event: EventDetail) => void;
};

const parseDateUTC = (value?: string | null) => {
  if (!value) return null;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day));
};

const formatDateRange = (start?: string | null, end?: string | null) => {
  if (!start && !end) return "";
  const startDate = parseDateUTC(start);
  const endDate = parseDateUTC(end);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  if (startDate && endDate) {
    if (startDate.getTime() === endDate.getTime()) {
      return startDate.toLocaleDateString(undefined, opts);
    }
    const sameMonth = startDate.getMonth() === endDate.getMonth();
    const sameYear = startDate.getFullYear() === endDate.getFullYear();
    const startStr = startDate.toLocaleDateString(undefined, opts);
    const endStr = endDate.toLocaleDateString(
      undefined,
      sameMonth && sameYear ? { day: "numeric", timeZone: "UTC" } : opts
    );
    return `${startStr} – ${endStr}`;
  }
  if (startDate) return startDate.toLocaleDateString(undefined, opts);
  return "";
};

const formatSingleDate = (value?: string | null) => {
  const date = parseDateUTC(value);
  if (!date) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

type WhoIsPlayingPlayer = {
  id: string;
  user_id: string;
  name: string;
  teammates: string[];
};

type WhoIsPlayingSubmission = {
  id: string;
  user_id: string;
  name: string;
  answers?: Record<string, JsonValue> | null;
};

const teammateAnswerKeyPattern =
  /(^|_)(teammates?|team_?mates?|team_?members?|additional_?players?|player_?\d+|player_?names?|guest_?name)(_|$)/i;

const ignoredTeammateAnswerKeyPattern =
  /(email|phone|number|jersey|color|division|skill|age|waiver|agreement|captain|team_?name|communications)/i;

const looksLikePersonName = (value: string) => {
  const normalized = value.trim();
  if (normalized.length < 2 || normalized.length > 80) return false;
  if (!/[a-z]/i.test(normalized)) return false;
  if (/^(yes|no|true|false|none|n\/a|na)$/i.test(normalized)) return false;
  if (/^@/.test(normalized)) return false;
  if (/[/\\]/.test(normalized)) return false;
  if (/\.(?:png|jpe?g|webp|gif|pdf|heic)$/i.test(normalized)) return false;
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(normalized)) return false;
  return true;
};

const splitPotentialNames = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(looksLikePersonName);

const extractTeammateNames = (answers?: Record<string, JsonValue> | null) => {
  if (!answers) return [];

  const names: string[] = [];
  for (const [key, value] of Object.entries(answers)) {
    if (!teammateAnswerKeyPattern.test(key) || ignoredTeammateAnswerKeyPattern.test(key)) continue;

    if (typeof value === "string") {
      names.push(...splitPotentialNames(value));
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string") {
          names.push(...splitPotentialNames(entry));
        }
      }
    }
  }

  return [...new Set(names)];
};

export function EventDetailModal({ open, event, dateLabel, isRegistered = false, onClose, onRegister }: EventDetailModalProps) {
  const [flyerImageUrl, setFlyerImageUrl] = useState<string | null>(null);
  const [flyerDetails, setFlyerDetails] = useState<string | null>(null);
  const [hasFlyerMatch, setHasFlyerMatch] = useState(false);
  const [whoIsPlayingOpen, setWhoIsPlayingOpen] = useState(false);
  const [whoIsPlayingLoading, setWhoIsPlayingLoading] = useState(false);
  const [whoIsPlayingPlayers, setWhoIsPlayingPlayers] = useState<WhoIsPlayingPlayer[] | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !event) return;
    setFlyerImageUrl(null);
    setFlyerDetails(null);
    setHasFlyerMatch(false);
    const client = supabase;
    if (!client) return;
    let cancelled = false;
    const normalize = (value?: string | null) => (value ?? "").trim().toLowerCase();
    const toFlyerCandidates = (slug?: string | null) => {
      const normalized = normalize(slug);
      if (!normalized) return [];

      const candidates = new Set<string>();
      candidates.add(normalized);
      candidates.add(`${normalized}-flyer`);

      // Allow shared flyer keys like "youth-soccer-flyer" for "youth-soccer-league"
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
      const { data, error } = await client
        .from("flyers")
        .select("*");

      if (cancelled) return;
      if (error || !data) {
        setFlyerImageUrl(null);
        setFlyerDetails(null);
        setHasFlyerMatch(false);
        return;
      }

      const rows = data as Array<{
        event_id?: string | null;
        flyer_name?: string | null;
        flyer_image_url?: string | null;
        image_url?: string | null;
        details?: string | null;
      }>;

      const slugKey = normalize(event.registration_program_slug);
      const titleKey = normalize(event.title);
      const slugCandidates = toFlyerCandidates(event.registration_program_slug);

      const directMatch = rows.find((row) => row.event_id === event.id) || null;
      const legacyRows = rows.filter((row) => !row.event_id);
      const allowLegacyMatch = event.host_type !== "partner";
      const legacyMatch = allowLegacyMatch
        ? legacyRows.find((row) => slugCandidates.includes(normalize(row.flyer_name))) ||
          legacyRows.find((row) => normalize(row.flyer_name) === slugKey) ||
          legacyRows.find((row) => normalize(row.flyer_name) === titleKey) ||
          null
        : null;
      const match = directMatch || legacyMatch;

      const matchedFlyerImage = match?.flyer_image_url?.trim() || match?.image_url?.trim() || null;

      setFlyerImageUrl(matchedFlyerImage);
      setFlyerDetails(match?.details ?? null);
      setHasFlyerMatch(Boolean(match));
    };

    loadFlyer();
    return () => {
      cancelled = true;
    };
  }, [open, event]);

  useEffect(() => {
    setWhoIsPlayingOpen(false);
    setWhoIsPlayingLoading(false);
    setWhoIsPlayingPlayers(null);
  }, [event?.id]);

  useEffect(() => {
    if (!whoIsPlayingOpen) return;
    const handleKey = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") setWhoIsPlayingOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [whoIsPlayingOpen]);

  const isSundayLeague = isRegularAslSundayLeagueEvent({
    title: event?.title ?? "",
    description: event?.description ?? "",
    registration_program_slug: event?.registration_program_slug ?? "",
    sport_slug: "",
  });

  const openWhoIsPlaying = async () => {
    setWhoIsPlayingOpen(true);
    if (whoIsPlayingPlayers !== null) return;
    if (!supabase || !event) return;
    setWhoIsPlayingLoading(true);
    const { data } = await supabase
      .from("event_submissions")
      .select("id,user_id,name,answers")
      .eq("event_id", event.id);
    const seen = new Set<string>();
    const unique = ((data ?? []) as WhoIsPlayingSubmission[]).flatMap((row) => {
      if (seen.has(row.user_id)) return [];

      seen.add(row.user_id);
      const teammateNames = extractTeammateNames(row.answers).filter((name) => {
        const teammateKey = `${row.id}:teammate:${name.toLowerCase()}`;
        if (seen.has(teammateKey)) return false;
        seen.add(teammateKey);
        return true;
      });

      return [{
        id: row.id,
        user_id: row.user_id,
        name: row.name,
        teammates: teammateNames,
      }];
    });
    setWhoIsPlayingPlayers(unique);
    setWhoIsPlayingLoading(false);
  };

  if (!open || !event) return null;

  const dateRange = formatDateRange(event.start_date, event.end_date) || dateLabel || "Date TBD";
  const timeInfo = event.time_info?.trim() || null;
  const startDateLabel = formatSingleDate(event.start_date);
  const endDateLabel = formatSingleDate(event.end_date);
  const flyerImage = hasFlyerMatch ? (flyerImageUrl || undefined) : (event.image || event.image_url || undefined);
  const eventPhoto = event.image || event.image_url || flyerImage || undefined;
  const moreInfo = flyerDetails || event.description || null;
  const teamPlayers = whoIsPlayingPlayers?.filter((player) => player.teammates.length > 0) ?? [];
  const soloPlayers = whoIsPlayingPlayers?.filter((player) => player.teammates.length === 0) ?? [];

  const renderWhoIsPlayingGroup = (player: WhoIsPlayingPlayer) => (
    <div
      key={player.id}
      className={`who-popup__group${player.teammates.length > 0 ? " who-popup__group--with-teammates" : ""}`}
    >
      <Link className="who-popup__card who-popup__card--primary" href={`/profiles/${player.user_id}`}>
        {player.name}
      </Link>
      {player.teammates.length > 0 ? (
        <div className="who-popup__teammates">
          {player.teammates.map((teammate) => (
            <div key={`${player.id}-${teammate}`} className="who-popup__teammate">
              <small>Teammate</small>
              <span>{teammate}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <>
    <div
      className="event-detail-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${event.title} details`}
      onClick={onClose}
    >
      <div
        className="event-detail"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="event-detail__header">
          <div>
            <p className="eyebrow">Event spotlight</p>
            <h2>{event.title}</h2>
            <p className="muted">{event.location || "Location TBD"}</p>
          </div>
          <div className="event-detail__header-actions">
            {event.registration_enabled ? (
              isRegistered ? (
                <button className="button primary" type="button" disabled>
                  {getSignupSubmittedLabel(event)}
                </button>
              ) : (
                <button
                  className="button primary"
                  type="button"
                  onClick={() => onRegister?.(event)}
                >
                  {getSignupActionLabel(event)}
                </button>
              )
            ) : (
              <span className="muted">{getSignupUnavailableLabel(event)}</span>
            )}
            <button className="button ghost" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="event-detail__meta">
          <span className="pill pill--muted">{dateRange}</span>
          {timeInfo ? <span className="pill pill--muted">{timeInfo}</span> : null}
          <span className="pill pill--muted">{event.location || "Location TBD"}</span>
        </div>

        {!isSundayLeague ? (
          <div className="event-detail__who">
            <button
              className="event-detail__who-btn"
              type="button"
              onClick={() => void openWhoIsPlaying()}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              See Who&apos;s Playing
            </button>
          </div>
        ) : null}

        <div className="event-detail__layout">
          <div className="event-detail__info">
            <h3>More information</h3>
            {moreInfo ? (
              <p className="event-detail__copy">{moreInfo}</p>
            ) : (
              <p className="muted">Event details will be added soon.</p>
            )}
            <div className="event-detail__list">
              <h4>Schedule</h4>
              <ul>
                <li>Start date: {startDateLabel || "TBD"}</li>
                <li>End date: {endDateLabel || startDateLabel || "TBD"}</li>
                {timeInfo ? <li>Time: {timeInfo}</li> : null}
              </ul>
            </div>
          </div>

          <div className="event-detail__media">
            <div className="event-detail__flyer">
              <div className="event-detail__media-label">Flyer / Info Sheet</div>
              {flyerImage ? (
                <img src={flyerImage} alt={`${event.title} flyer`} />
              ) : (
                <div className="event-detail__media-empty">
                  <p>Drop a flyer image here when it is ready.</p>
                </div>
              )}
            </div>
            <div className="event-detail__gallery">
              <div className="event-detail__media-label">Event photos</div>
              {eventPhoto ? (
                <img src={eventPhoto} alt={`${event.title} photo`} />
              ) : (
                <div className="event-detail__media-empty">
                  <p>Save space for player or venue photos.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>

    {whoIsPlayingOpen ? (
      <div
        className="who-popup-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="Who's Playing"
        onClick={() => setWhoIsPlayingOpen(false)}
      >
        <div className="who-popup" onClick={(e) => e.stopPropagation()}>
          <div className="who-popup__header">
            <h3>Who&apos;s Playing</h3>
            <button className="who-popup__close" type="button" onClick={() => setWhoIsPlayingOpen(false)}>✕</button>
          </div>
          {whoIsPlayingLoading ? (
            <p className="muted">Loading...</p>
          ) : whoIsPlayingPlayers && whoIsPlayingPlayers.length > 0 ? (
            <div className="who-popup__sections">
              {teamPlayers.length > 0 ? (
                <section className="who-popup__section">
                  <h4>Team</h4>
                  <div className="who-popup__grid">
                    {teamPlayers.map(renderWhoIsPlayingGroup)}
                  </div>
                </section>
              ) : null}
              {soloPlayers.length > 0 ? (
                <section className="who-popup__section">
                  <h4>Solo</h4>
                  <div className="who-popup__grid">
                    {soloPlayers.map(renderWhoIsPlayingGroup)}
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <p className="muted">No one has signed up yet.</p>
          )}
        </div>
      </div>
    ) : null}
    </>
  );
}
