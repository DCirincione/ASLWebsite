"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type BookingSlot = {
  id: string;
  starts_at: string;
  ends_at: string;
  location: string;
  venue_fee_cents: number;
};

const timeZone = "America/New_York";
const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" });
const dayNumber = new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" });
const month = new Intl.DateTimeFormat("en-US", { timeZone, month: "short" });
const fullDate = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric" });
const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });

export default function BookingAvailability({ slots, selectedSlotId, onSelectSlot, fallbackLocation }: {
  slots: BookingSlot[];
  selectedSlotId: string;
  onSelectSlot: (id: string) => void;
  fallbackLocation: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [edges, setEdges] = useState({ start: true, end: true });
  const grouped = new Map<string, BookingSlot[]>();
  for (const slot of [...slots].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))) {
    const key = dateKey.format(new Date(slot.starts_at));
    grouped.set(key, [...(grouped.get(key) ?? []), slot]);
  }
  const days = [...grouped.entries()];
  const activeDate = grouped.has(selectedDate) ? selectedDate : days[0]?.[0];
  const activeSlots = grouped.get(activeDate) ?? [];
  const activeDay = activeSlots[0] ? new Date(activeSlots[0].starts_at) : null;

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const start = el.scrollLeft <= 2;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    setEdges(previous => previous.start === start && previous.end === end ? previous : { start, end });
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    if (track.current) observer.observe(track.current);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [measure, days.length]);

  function chooseDay(key: string) {
    setSelectedDate(key);
    if (key !== activeDate) onSelectSlot("");
  }

  function scroll(direction: number) {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  return <div className="booking-availability">
    <div className="booking-days-heading">
      <span id="booking-days-label">Available days</span>
      <div className="booking-days-arrows">
        <button type="button" aria-label="Show earlier available days" aria-controls="booking-days" disabled={edges.start} onClick={() => scroll(-1)}>‹</button>
        <button type="button" aria-label="Show later available days" aria-controls="booking-days" disabled={edges.end} onClick={() => scroll(1)}>›</button>
      </div>
    </div>
    <div className="booking-days" id="booking-days" ref={track} role="group" aria-labelledby="booking-days-label" onScroll={measure}>
      {days.map(([key, daySlots], index) => {
        const date = new Date(daySlots[0].starts_at);
        return <button type="button" className="booking-day" key={key} aria-pressed={key === activeDate}
          aria-label={`${fullDate.format(date)}, ${daySlots.length} available time${daySlots.length === 1 ? "" : "s"}`}
          aria-controls="booking-day-times" onClick={() => chooseDay(key)}
          onKeyDown={event => {
            const next = event.key === "ArrowRight" ? Math.min(index + 1, days.length - 1)
              : event.key === "ArrowLeft" ? Math.max(index - 1, 0)
                : event.key === "Home" ? 0 : event.key === "End" ? days.length - 1 : null;
            if (next === null) return;
            event.preventDefault();
            chooseDay(days[next][0]);
            const button = track.current?.querySelectorAll<HTMLButtonElement>("button")[next];
            button?.focus({ preventScroll: true });
            button?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
          }}>
          <span>{weekday.format(date)}</span><b>{dayNumber.format(date)}</b><small>{month.format(date)}</small>
        </button>;
      })}
    </div>
    <div id="booking-day-times" role="group" aria-labelledby="booking-times-label">
      <p className="booking-times-label" id="booking-times-label" aria-live="polite">{activeDay && fullDate.format(activeDay)} <span>· Eastern time</span></p>
      <div className="booking-times">
        {activeSlots.map(slot => <button type="button" className="booking-time" key={slot.id} aria-pressed={selectedSlotId === slot.id} onClick={() => onSelectSlot(slot.id)}>
          <b>{time.format(new Date(slot.starts_at))}</b>
          <span>{slot.location || fallbackLocation}</span>
          <small>{slot.venue_fee_cents ? `${(slot.venue_fee_cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} venue fee` : "No venue fee"}</small>
        </button>)}
      </div>
    </div>
  </div>;
}
