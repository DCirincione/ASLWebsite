"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase/client";

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
  registration_program_slug?: string | null;
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

export function EventDetailModal({ open, event, dateLabel, isRegistered = false, onClose, onRegister }: EventDetailModalProps) {
  const [flyerImageUrl, setFlyerImageUrl] = useState<string | null>(null);
  const [flyerEventPhotoUrl, setFlyerEventPhotoUrl] = useState<string | null>(null);
  const [flyerDetails, setFlyerDetails] = useState<string | null>(null);
  const [hasFlyerMatch, setHasFlyerMatch] = useState(false);

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
        setFlyerEventPhotoUrl(null);
        setFlyerDetails(null);
        setHasFlyerMatch(false);
        return;
      }

      const rows = data as Array<{
        flyer_name?: string | null;
        flyer_image_url?: string | null;
        event_photo_url?: string | null;
        image_url?: string | null;
        details?: string | null;
      }>;

      const slugKey = normalize(event.registration_program_slug);
      const titleKey = normalize(event.title);
      const slugCandidates = toFlyerCandidates(event.registration_program_slug);

      const match =
        rows.find((row) => slugCandidates.includes(normalize(row.flyer_name))) ||
        rows.find((row) => normalize(row.flyer_name) === slugKey) ||
        rows.find((row) => normalize(row.flyer_name) === titleKey) ||
        null;

      const matchedFlyerImage = match?.flyer_image_url?.trim() || match?.image_url?.trim() || null;
      const matchedEventPhoto = match?.event_photo_url?.trim() || null;

      setFlyerImageUrl(matchedFlyerImage);
      setFlyerEventPhotoUrl(matchedEventPhoto);
      setFlyerDetails(match?.details ?? null);
      setHasFlyerMatch(Boolean(match));
    };

    loadFlyer();
    return () => {
      cancelled = true;
    };
  }, [open, event]);

  if (!open || !event) return null;

  const dateRange = formatDateRange(event.start_date, event.end_date) || dateLabel || "Date TBD";
  const timeInfo = event.time_info?.trim() || null;
  const startDateLabel = formatSingleDate(event.start_date);
  const endDateLabel = formatSingleDate(event.end_date);
  const flyerImage = hasFlyerMatch ? (flyerImageUrl || undefined) : (event.image || event.image_url || undefined);
  const eventPhoto = hasFlyerMatch
    ? (flyerEventPhotoUrl || flyerImage || undefined)
    : (event.image || event.image_url || undefined);
  const moreInfo = flyerDetails || event.description || null;

  return (
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
            {event.registration_program_slug ? (
              isRegistered ? (
                <button className="button primary" type="button" disabled>
                  Registered
                </button>
              ) : (
                <button
                  className="button primary"
                  type="button"
                  onClick={() => onRegister?.(event)}
                >
                  Sign up
                </button>
              )
            ) : (
              <span className="muted">Registration coming soon</span>
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

        <div className="event-detail__layout">
          <div className="event-detail__info">
            <h3>More information</h3>
            {moreInfo ? (
              <p>{moreInfo}</p>
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
  );
}
