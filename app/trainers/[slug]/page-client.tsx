"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";

import { HistoryBackButton } from "@/components/history-back-button";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import type { TrainerProfile } from "@/lib/trainers";

type TrainerPageClientProps = {
  trainer: TrainerProfile;
};

const formatAvailabilityDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};

export default function TrainerPageClient({ trainer }: TrainerPageClientProps) {
  const firstAvailableDate = trainer.availability[0]?.date ?? "";
  const [selectedDate, setSelectedDate] = useState(firstAvailableDate);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [selectedSession, setSelectedSession] = useState(trainer.sessionTypes[0]?.name ?? "");
  const [bookingStatus, setBookingStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message?: string }>({ type: "idle" });

  const selectedDay = useMemo(
    () => trainer.availability.find((day) => day.date === selectedDate) ?? null,
    [selectedDate, trainer.availability],
  );

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    setSelectedSlotId("");
    setBookingStatus({ type: "idle" });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedDate || !selectedSlotId || !selectedSession) return;

    const formData = new FormData(event.currentTarget);
    setBookingStatus({ type: "loading", message: "Sending booking request..." });

    try {
      const response = await fetch("/api/trainers/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainerId: trainer.id,
          availabilitySlotId: selectedSlotId,
          sessionOptionName: selectedSession,
          customerName: String(formData.get("name") ?? ""),
          customerEmail: String(formData.get("email") ?? ""),
          customerPhone: String(formData.get("phone") ?? ""),
          notes: String(formData.get("notes") ?? ""),
        }),
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(json?.error ?? "Could not book this session.");
      }

      setBookingStatus({
        type: "success",
        message: "Session request sent. This time is now held for your booking.",
      });
    } catch (error) {
      setBookingStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Could not book this session.",
      });
    }
  };

  return (
    <PageShell>
      <div className="trainer-page__back">
        <HistoryBackButton label="Back to Events" fallbackHref="/events" />
      </div>

      <Section
        id="trainer-profile"
        className="trainer-page"
        eyebrow={trainer.sport}
        title={trainer.name}
        description={trainer.headline}
        headingLevel="h1"
      >
        <div className="trainer-profile">
          <div className="trainer-profile__media">
            <div className="trainer-profile__headshot">
              <Image
                src={trainer.headshotUrl}
                alt={`${trainer.name} headshot`}
                fill
                sizes="(max-width: 720px) 100vw, 380px"
                priority
              />
            </div>
            <div className="trainer-profile__flyer">
              <Image
                src={trainer.flyerUrl}
                alt={`${trainer.name} training flyer`}
                fill
                sizes="(max-width: 720px) 100vw, 420px"
              />
            </div>
          </div>

          <div className="trainer-profile__details">
            <div className="trainer-profile__summary">
              <p className="eyebrow">Trainer</p>
              <h2>{trainer.name}</h2>
              <p>{trainer.bio}</p>
              <div className="trainer-profile__meta">
                <span>{trainer.location}</span>
                <span>{trainer.sport}</span>
              </div>
            </div>

            {trainer.specialties.length > 0 ? (
              <div className="trainer-profile__panel">
                <h3>Specialties</h3>
                <div className="trainer-profile__chips">
                  {trainer.specialties.map((specialty) => (
                    <span key={specialty}>{specialty}</span>
                  ))}
                </div>
              </div>
            ) : null}

            {trainer.sessionTypes.length > 0 ? (
              <div className="trainer-profile__panel">
                <h3>Session Options</h3>
                <div className="trainer-session-list">
                  {trainer.sessionTypes.map((session) => (
                    <label key={session.name} className="trainer-session-option">
                      <input
                        type="radio"
                        name="sessionType"
                        value={session.name}
                        checked={selectedSession === session.name}
                        onChange={() => {
                          setSelectedSession(session.name);
                          setBookingStatus({ type: "idle" });
                        }}
                      />
                      <span>
                        <strong>{session.name}</strong>
                        <small>{session.duration} • {session.price}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="trainer-booking" id="book-session">
          <div className="trainer-booking__header">
            <div>
              <p className="eyebrow">Book a Session</p>
              <h2>Choose an Available Time</h2>
            </div>
            <Link className="button ghost" href="/events">
              Back to Events
            </Link>
          </div>

          {trainer.availability.length > 0 ? (
            <form className="trainer-booking__grid" onSubmit={handleSubmit}>
              <div className="trainer-booking__calendar" aria-label="Available training dates">
                {trainer.availability.map((day) => (
                  <button
                    key={day.date}
                    className={`trainer-booking__date${selectedDate === day.date ? " is-selected" : ""}`}
                    type="button"
                    onClick={() => handleDateChange(day.date)}
                  >
                    <span>{formatAvailabilityDate(day.date)}</span>
                    <small>{day.slots.length} time{day.slots.length === 1 ? "" : "s"}</small>
                  </button>
                ))}
              </div>

              <div className="trainer-booking__times">
                <h3>{selectedDate ? formatAvailabilityDate(selectedDate) : "Select a date"}</h3>
                <div className="trainer-booking__time-grid">
                  {selectedDay?.slots.map((slot) => (
                    <button
                      key={slot.id}
                      className={`trainer-booking__time${selectedSlotId === slot.id ? " is-selected" : ""}`}
                      type="button"
                      onClick={() => {
                        setSelectedSlotId(slot.id);
                        setBookingStatus({ type: "idle" });
                      }}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>

                <div className="trainer-booking__contact">
                  <label>
                    Name
                    <input name="name" type="text" placeholder="Your name" required />
                  </label>
                  <label>
                    Email
                    <input name="email" type="email" placeholder="you@example.com" required />
                  </label>
                  <label>
                    Phone
                    <input name="phone" type="tel" placeholder="Optional" />
                  </label>
                  <label>
                    Notes
                    <textarea name="notes" rows={3} placeholder="Goals, age group, or anything the trainer should know" />
                  </label>
                </div>

                <button className="button primary" type="submit" disabled={!selectedDate || !selectedSlotId || !selectedSession || bookingStatus.type === "loading"}>
                  {bookingStatus.type === "loading" ? "Booking..." : "Book Session"}
                </button>
                {bookingStatus.message ? (
                  <p className={`trainer-booking__status trainer-booking__status--${bookingStatus.type}`} role="status">
                    {bookingStatus.message}
                  </p>
                ) : null}
              </div>
            </form>
          ) : (
            <p className="muted">This trainer has not posted availability yet.</p>
          )}
        </div>
      </Section>
    </PageShell>
  );
}
