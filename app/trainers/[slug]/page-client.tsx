"use client";

import { useMemo, useState, type FormEvent } from "react";

import { HistoryBackButton } from "@/components/history-back-button";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { parseSessionDurationMinutes, type TrainerProfile } from "@/lib/trainers";

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

const getAvailabilityForSession = (trainer: TrainerProfile, sessionName: string) => {
  const session = trainer.sessionTypes.find((entry) => entry.name === sessionName) ?? trainer.sessionTypes[0] ?? null;
  const durationMinutes = session ? parseSessionDurationMinutes(session.duration) : null;

  if (!durationMinutes) return [];

  return trainer.availability.flatMap((day) => {
    const slots = day.slots.filter((slot) => slot.durationMinutes === durationMinutes);
    return slots.length > 0 ? [{ ...day, slots }] : [];
  });
};

export default function TrainerPageClient({ trainer }: TrainerPageClientProps) {
  const defaultSession = trainer.sessionTypes[0]?.name ?? "";
  const defaultAvailability = getAvailabilityForSession(trainer, defaultSession);
  const [selectedDate, setSelectedDate] = useState(defaultAvailability[0]?.date ?? "");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [selectedSession, setSelectedSession] = useState(defaultSession);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingStatus, setBookingStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message?: string }>({ type: "idle" });

  const filteredAvailability = useMemo(
    () => getAvailabilityForSession(trainer, selectedSession),
    [selectedSession, trainer],
  );

  const selectedDay = useMemo(
    () => filteredAvailability.find((day) => day.date === selectedDate) ?? null,
    [filteredAvailability, selectedDate],
  );

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    setSelectedSlotId("");
    setBookingStatus({ type: "idle" });
  };

  const selectSession = (sessionName: string) => {
    const nextAvailability = getAvailabilityForSession(trainer, sessionName);
    setSelectedSession(sessionName);
    setSelectedDate(nextAvailability[0]?.date ?? "");
    setSelectedSlotId("");
    setBookingStatus({ type: "idle" });
  };

  const openBooking = (sessionName: string) => {
    selectSession(sessionName);
    setBookingOpen(true);
  };

  const closeBooking = () => {
    setBookingOpen(false);
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
              <img
                src={trainer.headshotUrl}
                alt={`${trainer.name} headshot`}
                loading="eager"
              />
            </div>
            <div className="trainer-profile__flyer">
              <img
                src={trainer.flyerUrl}
                alt={`${trainer.name} training flyer`}
                loading="lazy"
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
                    <div key={session.name} className="trainer-session-option">
                      <span className="trainer-session-option__marker" aria-hidden>
                        {selectedSession === session.name ? "●" : "○"}
                      </span>
                      <span>
                        <strong>{session.name}</strong>
                        <small>{session.duration} • {session.price}</small>
                      </span>
                      <button className="button primary trainer-session-option__button" type="button" onClick={() => openBooking(session.name)}>
                        Find Available Dates
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {bookingOpen ? (
          <div className="trainer-booking-modal" role="dialog" aria-modal="true" aria-labelledby="trainer-booking-title">
            <button className="trainer-booking-modal__backdrop" type="button" aria-label="Close booking calendar" onClick={closeBooking} />
            <div className="trainer-booking trainer-booking--modal" id="book-session">
              <button className="trainer-booking__close" type="button" aria-label="Close booking calendar" onClick={closeBooking}>
                ×
              </button>
              <div className="trainer-booking__header">
                <div>
                  <p className="eyebrow">Book a Session</p>
                  <h2 id="trainer-booking-title">Choose an Available Time</h2>
                  <p className="trainer-booking__session-label">{selectedSession}</p>
                </div>
              </div>

              {filteredAvailability.length > 0 ? (
                <form className="trainer-booking__grid" onSubmit={handleSubmit}>
                  <div className="trainer-booking__calendar" aria-label="Available training dates">
                    {filteredAvailability.map((day) => (
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
                        <input name="phone" type="tel" placeholder="Your phone number" required />
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
                <p className="muted">No available times are posted for this session option yet.</p>
              )}
            </div>
          </div>
        ) : null}
      </Section>
    </PageShell>
  );
}
