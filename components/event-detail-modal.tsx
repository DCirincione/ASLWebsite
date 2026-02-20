"use client";

import { useEffect } from "react";

type EventDetail = {
  id: string;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  time_info?: string | null;
  location?: string | null;
  description?: string | null;
  status?: "scheduled" | "potential" | "tbd" | null;
  host_type?: "aldrich" | "featured" | "partner" | "other" | null;
  image_url?: string | null;
  registration_program_slug?: string | null;
  image?: string | null;
};

type EventDetailModalProps = {
  open: boolean;
  event: EventDetail | null;
  dateLabel?: string;
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

export function EventDetailModal({ open, event, dateLabel, onClose, onRegister }: EventDetailModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open || !event) return null;

  const primaryDate = dateLabel || event.time_info?.trim() || formatDateRange(event.start_date, event.end_date) || "Date TBD";
  const statusLabel =
    event.status === "potential" ? "Potential" : event.status === "tbd" ? "TBD" : "Scheduled";
  const statusClass =
    event.status === "potential" ? "pill pill--amber" : event.status === "tbd" ? "pill pill--muted" : "pill pill--green";
  const image = event.image || event.image_url || undefined;

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
              <button
                className="button primary"
                type="button"
                onClick={() => onRegister?.(event)}
              >
                Sign up
              </button>
            ) : (
              <span className="muted">Registration coming soon</span>
            )}
            <button className="button ghost" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="event-detail__meta">
          <span className={statusClass}>{statusLabel}</span>
          <span className="pill pill--muted">{primaryDate}</span>
          <span className="pill pill--muted">{event.location || "Location TBD"}</span>
        </div>

        <div className="event-detail__layout">
          <div className="event-detail__info">
            <h3>More information</h3>
            {event.description ? (
              <p>{event.description}</p>
            ) : (
              <p className="muted">Event details will be added soon.</p>
            )}
            <div className="event-detail__list">
              <h4>Notes</h4>
              <ul>
                <li>Use this space for rules, schedules, and FAQ once they are ready.</li>
                <li>You can add flyers or extra pictures on the right-hand media slots.</li>
                <li>Share this with partners to gather final copy and assets.</li>
              </ul>
            </div>
          </div>

          <div className="event-detail__media">
            <div className="event-detail__flyer">
              <div className="event-detail__media-label">Flyer / Info Sheet</div>
              {image ? (
                <img src={image} alt={`${event.title} flyer`} />
              ) : (
                <div className="event-detail__media-empty">
                  <p>Drop a flyer image here when it is ready.</p>
                </div>
              )}
            </div>
            <div className="event-detail__gallery">
              <div className="event-detail__media-label">Event photos</div>
              {image ? (
                <img src={image} alt={`${event.title} photo`} />
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
