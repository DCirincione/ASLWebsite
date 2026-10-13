"use client";

import { useEffect, useRef, useState } from "react";
import type { TrainerAvailabilitySlot } from "@/lib/supabase/types";

const easternDay = (value: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
const date = (key: string) => new Date(`${key}T12:00:00Z`);
const keyOf = (value: Date) => value.toISOString().slice(0, 10);
const shift = (key: string, days: number) => { const value = date(key); value.setUTCDate(value.getUTCDate() + days); return keyOf(value); };
const label = (key: string, options: Intl.DateTimeFormatOptions) => date(key).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
const time = (value: string) => new Date(value).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function AvailabilityCalendar({ slots, onCancel }: { slots: TrainerAvailabilitySlot[]; onCancel: (id: string) => Promise<void> }) {
  const [today] = useState(() => easternDay(new Date()));
  const [month, setMonth] = useState(() => `${today.slice(0, 7)}-01`);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const grouped = new Map<string, TrainerAvailabilitySlot[]>();
  for (const slot of [...slots].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const key = easternDay(slot.starts_at);
    grouped.set(key, [...(grouped.get(key) ?? []), slot]);
  }
  const isOpen = selected !== null;
  useEffect(() => {
    if (!isOpen) return;
    const modal = dialog.current;
    modal?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { modal?.close(); document.body.style.overflow = previous; };
  }, [isOpen]); // Keep the dialog open while changing days.
  useEffect(() => {
    const row = strip.current;
    const active = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (row && active) {
      row.scrollLeft += active.getBoundingClientRect().left - row.getBoundingClientRect().left - (row.clientWidth - active.clientWidth) / 2;
    }
  }, [selected]);
  const offset = (date(month).getUTCDay() + 6) % 7;
  const nextMonth = date(month); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const days = Math.round((nextMonth.getTime() - date(month).getTime()) / 86400000);
  const weekStart = selected ? shift(selected, -((date(selected).getUTCDay() + 6) % 7)) : today;
  const changeMonth = (amount: number) => { const value = date(month); value.setUTCMonth(value.getUTCMonth() + amount); setMonth(keyOf(value)); };
  const changeWeek = (amount: number) => { if (selected) setSelected(shift(selected, amount * 7)); strip.current?.scrollTo({ left: 0 }); };
  return <div className="availability-calendar">
    <div className="availability-calendar__header"><h3 aria-live="polite">{label(month, { month: "long", year: "numeric" })}</h3><div><button type="button" className="button ghost" aria-label="Previous month" onClick={() => changeMonth(-1)}>←</button><button type="button" className="button ghost" onClick={() => setMonth(`${today.slice(0, 7)}-01`)}>Today</button><button type="button" className="button ghost" aria-label="Next month" onClick={() => changeMonth(1)}>→</button></div></div>
    <p className="muted">Select a day to view and manage its times. All times are Eastern.</p>
    <div className="availability-calendar__grid">
      {weekdays.map(day => <span className="availability-calendar__weekday" key={day}>{day}</span>)}
      {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} />)}
      {Array.from({ length: days }, (_, index) => { const key = shift(month, index); const count = (grouped.get(key) ?? []).filter(slot => slot.status !== "cancelled").length; return <button type="button" key={key} className="availability-calendar__day" aria-current={key === today ? "date" : undefined} aria-label={`${label(key, { month: "long", day: "numeric" })}, ${count} slots`} onClick={() => setSelected(key)}><strong>{index + 1}</strong>{count > 0 && <small>{count} <span>slot{count === 1 ? "" : "s"}</span></small>}</button>; })}
    </div>
    <dialog ref={dialog} className="availability-dialog" aria-label="Daily availability" onCancel={() => setSelected(null)} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setSelected(null); } }}>
      <div className="availability-calendar__header"><h2>Daily availability</h2><button type="button" className="button ghost" aria-label="Close daily availability" onClick={() => setSelected(null)}>✕</button></div>
      <div className="availability-week"><button type="button" className="button ghost" aria-label="Previous week" onClick={() => changeWeek(-1)}>←</button><div className="availability-week__days" ref={strip}>{weekdays.map((day, index) => { const key = shift(weekStart, index); return <button type="button" key={key} aria-pressed={selected === key} onClick={() => setSelected(key)}><span>{day}</span><strong>{label(key, { day: "numeric" })}</strong><small>{label(key, { month: "short" })}</small></button>; })}</div><button type="button" className="button ghost" aria-label="Next week" onClick={() => changeWeek(1)}>→</button></div>
      {selected && <><h3 aria-live="polite">{label(selected, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</h3><p className="muted">Eastern time</p><div className="training-slot-list">{(grouped.get(selected) ?? []).map(slot => <div className="training-slot-row" key={slot.id}><span>{time(slot.starts_at)} – {time(slot.ends_at)}</span><strong>{slot.status}</strong>{slot.status === "available" && <button className="button ghost" type="button" disabled={pending !== null} onClick={async () => { setPending(slot.id); try { await onCancel(slot.id); } finally { setPending(null); } }}>{pending === slot.id ? "Cancelling…" : "Cancel"}</button>}</div>)}{!grouped.get(selected)?.length && <p>No times added for this day.</p>}</div></>}
    </dialog>
  </div>;
}
