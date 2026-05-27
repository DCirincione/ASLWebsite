import { parseDateOnlyUTC, readEventRecurrence } from "@/lib/event-recurrence";
import type { JsonValue } from "@/lib/supabase/types";

type EventDateStatusInput = {
  start_date?: string | null;
  end_date?: string | null;
  registration_schema?: JsonValue | null;
};

export const getTodayDateOnlyUTC = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

export const getEventLastDate = (event: EventDateStatusInput) => {
  const recurrence = readEventRecurrence(event.registration_schema);
  const recurringLastDate =
    recurrence?.mode === "dates"
      ? recurrence.dates[recurrence.dates.length - 1]
      : recurrence?.mode === "weekly"
        ? recurrence.until
        : null;

  return parseDateOnlyUTC(recurringLastDate ?? event.end_date ?? event.start_date);
};

export const isPastEvent = (event: EventDateStatusInput, now = new Date()) => {
  const lastDate = getEventLastDate(event);
  if (!lastDate) return false;

  return lastDate.getTime() < getTodayDateOnlyUTC(now).getTime();
};

export const sortPastEventsNewestFirst = <T extends EventDateStatusInput>(events: T[]) =>
  [...events].sort((left, right) => {
    const leftTime = getEventLastDate(left)?.getTime() ?? 0;
    const rightTime = getEventLastDate(right)?.getTime() ?? 0;
    return rightTime - leftTime;
  });
