import { createId } from "@/lib/create-id";
import type { JsonValue } from "@/lib/supabase/types";

export const WEEKDAY_OPTIONS = [
  { value: 0, shortLabel: "Sun", longLabel: "Sunday" },
  { value: 1, shortLabel: "Mon", longLabel: "Monday" },
  { value: 2, shortLabel: "Tue", longLabel: "Tuesday" },
  { value: 3, shortLabel: "Wed", longLabel: "Wednesday" },
  { value: 4, shortLabel: "Thu", longLabel: "Thursday" },
  { value: 5, shortLabel: "Fri", longLabel: "Friday" },
  { value: 6, shortLabel: "Sat", longLabel: "Saturday" },
] as const;

export const MAX_RECURRING_OCCURRENCES = 120;

export type EventRecurrenceMode = "none" | "dates" | "weekly";

export type EventRecurrenceRule =
  | {
      mode: "dates";
      dates: string[];
    }
  | {
      mode: "weekly";
      weekdays: number[];
      until: string;
    };

export type EventRecurrenceMetadata = {
  mode: EventRecurrenceRule["mode"];
  dates?: string[];
  weekdays?: number[];
  until?: string;
  series_id: string;
  template_start_date: string;
  template_end_date: string | null;
  occurrence_start_date: string;
  occurrence_end_date: string | null;
};

type RegistrationSchemaWithRecurrence = {
  fields?: unknown;
  require_waiver?: boolean;
  recurrence?: unknown;
};

type RecurrenceInput = {
  mode?: unknown;
  dates?: unknown;
  weekdays?: unknown;
  until?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const parseDateOnlyUTC = (value?: string | null) => {
  if (!value || typeof value !== "string") return null;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null;
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day));
};

export const formatDateOnlyUTC = (value: Date) => value.toISOString().slice(0, 10);

export const addDaysUTC = (value: Date, days: number) => {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const diffDaysUTC = (start: Date, end: Date) => Math.round((end.getTime() - start.getTime()) / 86_400_000);

export const weekdayLabel = (weekday: number, format: "short" | "long" = "short") =>
  WEEKDAY_OPTIONS.find((option) => option.value === weekday)?.[format === "long" ? "longLabel" : "shortLabel"] ?? "";

export const formatWeekdayList = (weekdays: number[], format: "short" | "long" = "short") =>
  weekdays
    .map((weekday) => weekdayLabel(weekday, format))
    .filter(Boolean)
    .join(", ");

export const formatRecurrenceSummary = (recurrence: EventRecurrenceRule) => {
  if (recurrence.mode === "dates") {
    return recurrence.dates.length === 1
      ? `Repeats on ${recurrence.dates[0]}`
      : `Repeats on ${recurrence.dates.length} dates`;
  }

  const days = formatWeekdayList(recurrence.weekdays);
  return days ? `Every ${days} until ${recurrence.until}` : `Repeats until ${recurrence.until}`;
};

export const normalizeWeekdays = (value: unknown) => {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value.flatMap((entry) => {
        const parsed = typeof entry === "number" ? entry : typeof entry === "string" ? Number(entry) : NaN;
        return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6 ? [parsed] : [];
      })
    )
  ).sort((a, b) => a - b);
};

export const normalizeExactDates = (value: unknown) => {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value.flatMap((entry) => {
        const dateValue = typeof entry === "string" ? entry.trim() : "";
        return parseDateOnlyUTC(dateValue) ? [dateValue] : [];
      }),
    ),
  ).sort();
};

export const parseEventRecurrenceInput = (value: unknown) => {
  const input = (isRecord(value) ? value : {}) as RecurrenceInput;
  const mode = input.mode === "dates" || input.mode === "weekly" ? input.mode : "none";

  if (mode === "none") {
    return { recurrence: null as EventRecurrenceRule | null };
  }

  if (mode === "dates") {
    const dates = normalizeExactDates(input.dates);
    if (dates.length === 0) {
      return { error: "Choose at least one recurring date." };
    }

    return {
      recurrence: {
        mode,
        dates,
      },
    };
  }

  const weekdays = normalizeWeekdays(input.weekdays);
  if (weekdays.length === 0) {
    return { error: "Choose at least one weekday for a recurring event." };
  }

  const until = typeof input.until === "string" ? input.until.trim() : "";
  if (!parseDateOnlyUTC(until)) {
    return { error: "Choose a valid repeat-until date for the recurring event." };
  }

  return {
    recurrence: {
      mode: "weekly" as const,
      weekdays,
      until,
    },
  };
};

export const readEventRecurrence = (schema: JsonValue | null | undefined) => {
  const schemaObject = isRecord(schema) ? (schema as RegistrationSchemaWithRecurrence) : null;
  const recurrenceValue = schemaObject?.recurrence;
  if (!isRecord(recurrenceValue)) return null;

  const mode = recurrenceValue.mode === "dates" || recurrenceValue.mode === "weekly" ? recurrenceValue.mode : null;
  if (mode === "dates") {
    const dates = normalizeExactDates(recurrenceValue.dates);
    if (!dates.length) return null;

    return {
      mode,
      dates,
    } satisfies EventRecurrenceRule;
  }

  const until = typeof recurrenceValue.until === "string" ? recurrenceValue.until.trim() : "";
  const weekdays = normalizeWeekdays(recurrenceValue.weekdays);

  if (mode !== "weekly" || !weekdays.length || !parseDateOnlyUTC(until)) {
    return null;
  }

  return {
    mode,
    weekdays,
    until,
  } satisfies EventRecurrenceRule;
};

export const mergeRegistrationSchemaRecurrence = (
  schema: JsonValue | null | undefined,
  recurrence: EventRecurrenceMetadata | null
): JsonValue | null => {
  const baseSchema = isRecord(schema) ? { ...schema } : {};

  if (recurrence) {
    return {
      ...baseSchema,
      recurrence,
    };
  }

  if (!("recurrence" in baseSchema)) {
    return Object.keys(baseSchema).length > 0 ? (baseSchema as JsonValue) : null;
  }

  delete baseSchema.recurrence;
  return Object.keys(baseSchema).length > 0 ? (baseSchema as JsonValue) : null;
};

export const buildRecurringDatePairs = (
  startDateValue: string,
  endDateValue: string | null | undefined,
  recurrence: EventRecurrenceRule
) => {
  const startDate = parseDateOnlyUTC(startDateValue);
  if (!startDate) {
    return { error: "Choose a start date before creating a recurring event." };
  }

  if (recurrence.mode === "dates") {
    const dates = normalizeExactDates(recurrence.dates);
    if (dates.length === 0) {
      return { error: "Choose at least one recurring date." };
    }
    if (dates.length > MAX_RECURRING_OCCURRENCES) {
      return {
        error: `Recurring events can create up to ${MAX_RECURRING_OCCURRENCES} dates at one time. Remove a few dates and try again.`,
      };
    }

    const endDate = parseDateOnlyUTC(endDateValue);
    const durationDays = endDate && endDate.getTime() >= startDate.getTime() ? diffDaysUTC(startDate, endDate) : 0;
    return {
      occurrences: dates.map((date) => {
        const dateValue = parseDateOnlyUTC(date) ?? startDate;
        return {
          start_date: date,
          end_date: durationDays > 0 ? formatDateOnlyUTC(addDaysUTC(dateValue, durationDays)) : endDateValue ? date : null,
        };
      }),
    };
  }

  const untilDate = parseDateOnlyUTC(recurrence.until);
  if (!untilDate) {
    return { error: "Choose a valid repeat-until date for the recurring event." };
  }
  if (untilDate.getTime() < startDate.getTime()) {
    return { error: "Repeat-until date must be on or after the start date." };
  }

  const endDate = parseDateOnlyUTC(endDateValue);
  const durationDays = endDate && endDate.getTime() >= startDate.getTime() ? diffDaysUTC(startDate, endDate) : 0;
  const weekdaySet = new Set(recurrence.weekdays);
  const occurrences: Array<{ start_date: string; end_date: string | null }> = [];

  for (let cursor = startDate; cursor.getTime() <= untilDate.getTime(); cursor = addDaysUTC(cursor, 1)) {
    if (!weekdaySet.has(cursor.getUTCDay())) continue;

    const occurrenceStart = formatDateOnlyUTC(cursor);
    const occurrenceEnd = durationDays > 0 ? formatDateOnlyUTC(addDaysUTC(cursor, durationDays)) : endDateValue ? occurrenceStart : null;
    occurrences.push({
      start_date: occurrenceStart,
      end_date: occurrenceEnd,
    });

    if (occurrences.length > MAX_RECURRING_OCCURRENCES) {
      return {
        error: `Recurring events can create up to ${MAX_RECURRING_OCCURRENCES} dates at one time. Shorten the date range and try again.`,
      };
    }
  }

  if (occurrences.length === 0) {
    return { error: "No event dates matched the selected recurring weekdays." };
  }

  return { occurrences };
};

export const buildRecurrenceMetadata = (
  recurrence: EventRecurrenceRule,
  templateStartDate: string,
  templateEndDate: string | null | undefined,
  occurrence: { start_date: string; end_date: string | null },
  seriesId = createId()
): EventRecurrenceMetadata => ({
  mode: recurrence.mode,
  ...(recurrence.mode === "dates"
    ? { dates: recurrence.dates }
    : { weekdays: recurrence.weekdays, until: recurrence.until }),
  series_id: seriesId,
  template_start_date: templateStartDate,
  template_end_date: templateEndDate ?? null,
  occurrence_start_date: occurrence.start_date,
  occurrence_end_date: occurrence.end_date ?? null,
});
