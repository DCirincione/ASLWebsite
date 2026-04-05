"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { EventDetailModal } from "@/components/event-detail-modal";
import { PageShell } from "@/components/page-shell";
import { RegistrationModal } from "@/components/registration-modal";
import { Section } from "@/components/section";
import { readEventRecurrence } from "@/lib/event-recurrence";
import {
  getSignupActionLabel,
  getSignupSubmittedLabel,
  getSignupUnavailableLabel,
  getSignupUnavailableMessage,
} from "@/lib/event-signups";
import { filterVisiblePublicEvents } from "@/lib/event-approval";
import { formatEventSignupLabel, loadVisiblePublicEvents, type PublicEventSignupStats } from "@/lib/public-event-signups";
import { normalizeSportSlug } from "@/lib/sports";
import { supabase } from "@/lib/supabase/client";
import { useRegisteredEventIds } from "@/lib/supabase/use-registered-program-slugs";
import { isRegularAslSundayLeagueEvent, SUNDAY_LEAGUE_HREF } from "@/lib/sunday-league";
import type { JsonValue, Sport } from "@/lib/supabase/types";

type EventItem = {
  id: string;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  time_info?: string | null;
  location?: string | null;
  description?: string | null;
  host_type?: "aldrich" | "featured" | "partner" | "other" | null;
  approval_status?: "approved" | "pending_approval" | "changes_requested" | null;
  image_url?: string | null;
  signup_mode?: "registration" | "waitlist" | null;
  registration_program_slug?: string | null;
  sport_id?: string | null;
  registration_enabled?: boolean | null;
  registration_limit?: number | null;
  payment_required?: boolean | null;
  payment_amount_cents?: number | null;
  registration_schema?: JsonValue | null;
  image?: string;
} & PublicEventSignupStats;

type FilterGroupKey = "sports" | "types" | "locations" | "ages" | "skills" | "prices";
type ViewMode = "cards" | "calendar";

type FacetOption = {
  value: string;
  label: string;
  count: number;
};

type DerivedEvent = EventItem & {
  image?: string;
  sportKey: string;
  sportLabel: string;
  eventTypeKey: string;
  eventTypeLabel: string;
  locationKey: string;
  locationLabel: string;
  ageLabels: string[];
  ageKeys: string[];
  skillLabels: string[];
  skillKeys: string[];
  priceKey: string;
  priceLabel: string;
  startDate: Date | null;
  endDate: Date | null;
  calendarEndDate: Date | null;
  recurringWeekdays: number[];
  searchText: string;
};

type CalendarCell = {
  key: string;
  label: string;
  isEmpty: boolean;
  isCurrentMonth: boolean;
  events: DerivedEvent[];
};

const EVENT_TYPE_ORDER = [
  "pickup",
  "league",
  "tournament",
  "fundraiser",
  "clinics",
  "private-training",
  "other",
] as const;

const PRICE_ORDER = ["free", "under-25", "25-49", "50-99", "100-plus"] as const;
const AGE_ORDER = ["youth", "adult", "all-ages"] as const;
const SKILL_ORDER = ["all-levels", "beginner", "recreational", "intermediate", "competitive", "advanced"] as const;

const slugifyFilterValue = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const titleCase = (value: string) =>
  value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const normalizeText = (value?: string | null) => (value ?? "").trim().toLowerCase();

const parseDateUTC = (value?: string | null) => {
  if (!value) return null;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null;
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day));
};

const DAY_IN_MS = 86_400_000;
const CALENDAR_MULTI_DAY_SPAN_LIMIT = 3;

const WEEKDAY_TEXT_PATTERNS = [
  { weekday: 0, pattern: /\b(?:sun|sunday|sundays)\b/ },
  { weekday: 1, pattern: /\b(?:mon|monday|mondays)\b/ },
  { weekday: 2, pattern: /\b(?:tue|tues|tuesday|tuesdays)\b/ },
  { weekday: 3, pattern: /\b(?:wed|wednesday|wednesdays)\b/ },
  { weekday: 4, pattern: /\b(?:thu|thur|thurs|thursday|thursdays)\b/ },
  { weekday: 5, pattern: /\b(?:fri|friday|fridays)\b/ },
  { weekday: 6, pattern: /\b(?:sat|saturday|saturdays)\b/ },
] as const;

const hasRecurringCue = (text: string) => /\b(?:every|each|weekly)\b/.test(text);
const hasPluralWeekdayCue = (text: string) =>
  /\b(?:sundays|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays)\b/.test(text);

const deriveRecurringWeekdaysFromText = (event: Pick<EventItem, "title" | "description" | "time_info">) => {
  const text = normalizeText(`${event.title ?? ""} ${event.description ?? ""} ${event.time_info ?? ""}`);
  if (!text || (!hasRecurringCue(text) && !hasPluralWeekdayCue(text))) return [];

  if (/\bevery\s+day\b/.test(text)) {
    return [0, 1, 2, 3, 4, 5, 6];
  }

  if (/\b(?:every|each|weekly)\s+weekdays?\b/.test(text)) {
    return [1, 2, 3, 4, 5];
  }

  if (/\b(?:every|each|weekly)\s+weekends?\b/.test(text)) {
    return [0, 6];
  }

  return WEEKDAY_TEXT_PATTERNS.flatMap(({ weekday, pattern }) => (pattern.test(text) ? [weekday] : []));
};

const getCalendarMetadata = (event: Pick<EventItem, "title" | "description" | "time_info" | "end_date" | "registration_schema">) => {
  const recurrence = readEventRecurrence(event.registration_schema);
  const recurringWeekdays = recurrence?.weekdays.length
    ? recurrence.weekdays
    : deriveRecurringWeekdaysFromText(event);
  const calendarEndDate = parseDateUTC(recurrence?.until ?? event.end_date);

  return {
    recurringWeekdays,
    calendarEndDate,
  };
};

const formatDateRange = (start?: string | null, end?: string | null) => {
  if (!start && !end) return "";
  const startDate = parseDateUTC(start);
  const endDate = parseDateUTC(end);
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };

  if (startDate && endDate) {
    if (startDate.getTime() === endDate.getTime()) {
      return startDate.toLocaleDateString(undefined, options);
    }

    const sameMonth = startDate.getUTCMonth() === endDate.getUTCMonth();
    const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();
    const startLabel = startDate.toLocaleDateString(undefined, options);
    const endLabel = endDate.toLocaleDateString(
      undefined,
      sameMonth && sameYear ? { day: "numeric", timeZone: "UTC" } : options,
    );

    return `${startLabel} – ${endLabel}`;
  }

  return startDate?.toLocaleDateString(undefined, options) ?? "";
};

const primaryDateLabel = (event: Pick<EventItem, "start_date" | "end_date" | "time_info">) => {
  const dateRange = formatDateRange(event.start_date, event.end_date);
  const timeInfo = event.time_info?.trim();
  if (dateRange && timeInfo) return `${dateRange} • ${timeInfo}`;
  return dateRange || timeInfo || "Date TBD";
};

const sortByStartDate = (a: DerivedEvent, b: DerivedEvent) => {
  if (!a.startDate && !b.startDate) return a.title.localeCompare(b.title);
  if (!a.startDate) return 1;
  if (!b.startDate) return -1;
  return a.startDate.getTime() - b.startDate.getTime() || a.title.localeCompare(b.title);
};

const heuristicAldrich = (event: Pick<EventItem, "title" | "location">) => {
  const titleMatch = event.title?.toLowerCase().includes("aldrich");
  const locationMatch = event.location?.toLowerCase().includes("aldrich");
  return Boolean(titleMatch || locationMatch);
};

const heuristicFeatured = (event: Pick<EventItem, "title" | "description">) => {
  const text = `${event.title ?? ""} ${event.description ?? ""}`.toLowerCase();
  const keywords = ["charity", "fundraiser", "benefit", "partner", "with", "hosted by", "vs"];
  return keywords.some((keyword) => text.includes(keyword));
};

const SPORT_LABEL_OVERRIDES: Array<[prefix: string, label: string]> = [
  ["youth-soccer-", "Youth Soccer"],
  ["youth-soccer", "Youth Soccer"],
  ["mini-golf-", "Mini-Golf"],
  ["mini-golf", "Mini-Golf"],
  ["flag-football-", "Flag Football"],
  ["football-", "Flag Football"],
  ["run-club", "Run Club"],
  ["pickleball-", "Pickleball"],
  ["basketball-", "Basketball"],
  ["soccer-", "Soccer"],
  ["baseball-", "Baseball / Softball"],
  ["homerun-derby", "Baseball / Softball"],
  ["golf-", "Golf"],
];

const resolveSportLabel = (event: EventItem, sportsById: Map<string, Sport>) => {
  if (event.sport_id) {
    const sport = sportsById.get(event.sport_id);
    if (sport?.title?.trim()) return sport.title.trim();
  }

  const registrationSlug = normalizeText(event.registration_program_slug);
  const match = SPORT_LABEL_OVERRIDES.find(([prefix]) => registrationSlug.startsWith(prefix));
  if (match) return match[1];

  const normalizedSportSlug = normalizeSportSlug({ slug: event.registration_program_slug ?? "" });
  if (!normalizedSportSlug) return "Other";

  return titleCase(normalizedSportSlug);
};

const resolveEventType = (event: EventItem) => {
  const registrationSlug = normalizeText(event.registration_program_slug);
  const combinedText = `${normalizeText(event.title)} ${normalizeText(event.description)}`;

  if (
    combinedText.includes("fundraiser") ||
    combinedText.includes("charity") ||
    combinedText.includes("benefit")
  ) {
    return { key: "fundraiser", label: "Fundraiser" };
  }

  if (
    combinedText.includes("private training") ||
    combinedText.includes("private lesson") ||
    combinedText.includes("personal training") ||
    combinedText.includes("one-on-one") ||
    combinedText.includes("1-on-1")
  ) {
    return { key: "private-training", label: "Private Training" };
  }

  if (registrationSlug.includes("pickup") || combinedText.includes("pickup")) {
    return { key: "pickup", label: "Pickup" };
  }

  if (registrationSlug.includes("league") || combinedText.includes("league")) {
    return { key: "league", label: "League" };
  }

  if (
    registrationSlug.includes("tournament") ||
    registrationSlug.includes("derby") ||
    combinedText.includes("tournament") ||
    combinedText.includes("derby")
  ) {
    return { key: "tournament", label: "Tournament" };
  }

  if (
    registrationSlug.includes("clinic") ||
    combinedText.includes("clinic") ||
    combinedText.includes("clinics")
  ) {
    return { key: "clinics", label: "Clinics" };
  }

  return { key: "other", label: "Other" };
};

const resolveAgeLabels = (event: EventItem) => {
  const text = `${normalizeText(event.title)} ${normalizeText(event.description)} ${normalizeText(event.registration_program_slug)}`;
  const labels = new Set<string>();

  for (const match of text.matchAll(/\bu\s?(\d{1,2})\b/g)) {
    const age = match[1]?.trim();
    if (age) labels.add(`U${age}`);
  }

  if (
    text.includes("youth") ||
    text.includes("kid") ||
    text.includes("kids") ||
    text.includes("junior") ||
    text.includes("children")
  ) {
    labels.add("Youth");
  }

  if (
    text.includes("adult") ||
    text.includes("18+") ||
    text.includes("men's") ||
    text.includes("mens") ||
    text.includes("women's") ||
    text.includes("womens")
  ) {
    labels.add("Adult");
  }

  if (text.includes("all ages")) {
    labels.add("All Ages");
  }

  return Array.from(labels);
};

const resolveSkillLabels = (event: EventItem) => {
  const text = `${normalizeText(event.title)} ${normalizeText(event.description)}`;
  const labels = new Set<string>();

  if (text.includes("all levels")) labels.add("All Levels");
  if (text.includes("beginner")) labels.add("Beginner");
  if (text.includes("recreational") || text.includes(" rec ")) labels.add("Recreational");
  if (text.includes("intermediate")) labels.add("Intermediate");
  if (text.includes("competitive")) labels.add("Competitive");
  if (text.includes("advanced")) labels.add("Advanced");

  return Array.from(labels);
};

const resolvePrice = (event: EventItem) => {
  const amountCents = event.payment_amount_cents ?? 0;
  if (!event.payment_required || amountCents <= 0) {
    return { key: "free", label: "Free" };
  }
  if (amountCents < 2500) {
    return { key: "under-25", label: "Under $25" };
  }
  if (amountCents < 5000) {
    return { key: "25-49", label: "$25 - $49" };
  }
  if (amountCents < 10000) {
    return { key: "50-99", label: "$50 - $99" };
  }
  return { key: "100-plus", label: "$100+" };
};

const getMonthKey = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

const addMonthKeysBetween = (months: Set<string>, startDate: Date, endDate: Date) => {
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  const lastMonth = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));

  while (cursor.getTime() <= lastMonth.getTime()) {
    months.add(getMonthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
};

const formatMonthLabel = (monthKey: string) => {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, 1));
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
};

const formatCalendarDayHeading = (monthKey: string, dayLabel: string) => {
  const [year, month] = monthKey.split("-").map(Number);
  const day = Number(dayLabel);
  if (!year || !month || !Number.isFinite(day)) return dayLabel;

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};

const eventOccursOnDay = (event: DerivedEvent, day: Date) => {
  const startDate = event.startDate;
  if (!startDate) return false;

  const dayTime = day.getTime();
  const endDate = event.calendarEndDate ?? event.endDate ?? startDate;
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();

  if (event.recurringWeekdays.length > 0) {
    return (
      dayTime >= startTime &&
      dayTime <= endTime &&
      event.recurringWeekdays.includes(day.getUTCDay())
    );
  }

  const durationDays = Math.max(0, Math.round((endTime - startTime) / DAY_IN_MS));
  if (durationDays <= CALENDAR_MULTI_DAY_SPAN_LIMIT) {
    return dayTime >= startTime && dayTime <= endTime;
  }

  return dayTime >= startTime && dayTime <= endTime && day.getUTCDay() === startDate.getUTCDay();
};

const toggleSelection = (values: string[], value: string) =>
  values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];

export default function EventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [modalEventId, setModalEventId] = useState<string | null>(null);
  const [modalTitle, setModalTitle] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<EventItem | null>(null);
  const [eventIdFromQuery, setEventIdFromQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedAges, setSelectedAges] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedPrices, setSelectedPrices] = useState<string[]>([]);
  const [openFilterGroups, setOpenFilterGroups] = useState<Record<FilterGroupKey, boolean>>({
    sports: false,
    types: false,
    locations: false,
    ages: false,
    skills: false,
    prices: false,
  });
  const [calendarMonth, setCalendarMonth] = useState("");
  const { isRegisteredEvent, refreshRegisteredEvents } = useRegisteredEventIds();

  const directLinkedEvent = eventIdFromQuery ? events.find((event) => event.id === eventIdFromQuery) ?? null : null;
  const activeDetailEvent =
    detailEvent ?? (directLinkedEvent && !isRegularAslSundayLeagueEvent(directLinkedEvent) ? directLinkedEvent : null);

  useEffect(() => {
    const loadEvents = async () => {
      if (!supabase) return;
      setLoading(true);
      const [{ data: sportsData }, eventData] = await Promise.all([
        supabase.from("sports").select("id,title,section_headers").order("title", { ascending: true }),
        loadVisiblePublicEvents<EventItem>(supabase),
      ]);

      setSports((sportsData ?? []) as Sport[]);
      setEvents(filterVisiblePublicEvents(eventData));
      setLoading(false);
    };

    void loadEvents();
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    client.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });

    return () => {
      subscription?.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const syncEventIdFromUrl = () => {
      const nextParams = new URLSearchParams(window.location.search);
      setEventIdFromQuery(nextParams.get("eventId")?.trim() || "");
    };

    syncEventIdFromUrl();
    window.addEventListener("popstate", syncEventIdFromUrl);
    return () => {
      window.removeEventListener("popstate", syncEventIdFromUrl);
    };
  }, []);

  const sportsById = useMemo(
    () => new Map(sports.map((sport) => [sport.id, sport])),
    [sports],
  );

  const derivedEvents = useMemo<DerivedEvent[]>(() => {
    return events
      .map((event) => {
        const sportLabel = resolveSportLabel(event, sportsById);
        const sportKey = slugifyFilterValue(sportLabel);
        const eventType = resolveEventType(event);
        const locationLabel = event.location?.trim() || "Location TBD";
        const locationKey = slugifyFilterValue(locationLabel);
        const ageLabels = resolveAgeLabels(event);
        const skillLabels = resolveSkillLabels(event);
        const price = resolvePrice(event);
        const calendarMetadata = getCalendarMetadata(event);

        return {
          ...event,
          image: event.image_url || undefined,
          sportKey,
          sportLabel,
          eventTypeKey: eventType.key,
          eventTypeLabel: eventType.label,
          locationKey,
          locationLabel,
          ageLabels,
          ageKeys: ageLabels.map(slugifyFilterValue),
          skillLabels,
          skillKeys: skillLabels.map(slugifyFilterValue),
          priceKey: price.key,
          priceLabel: price.label,
          startDate: parseDateUTC(event.start_date),
          endDate: parseDateUTC(event.end_date),
          calendarEndDate: calendarMetadata.calendarEndDate,
          recurringWeekdays: calendarMetadata.recurringWeekdays,
          searchText: [
            event.title,
            event.description,
            event.location,
            sportLabel,
            eventType.label,
            ...ageLabels,
            ...skillLabels,
            price.label,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
        };
      })
      .sort(sortByStartDate);
  }, [events, sportsById]);

  const labelRegistry = useMemo(() => {
    const registries = {
      sports: new Map<string, string>(),
      types: new Map<string, string>(),
      locations: new Map<string, string>(),
      ages: new Map<string, string>(),
      skills: new Map<string, string>(),
      prices: new Map<string, string>(),
    };

    for (const event of derivedEvents) {
      registries.sports.set(event.sportKey, event.sportLabel);
      registries.types.set(event.eventTypeKey, event.eventTypeLabel);
      registries.locations.set(event.locationKey, event.locationLabel);
      registries.prices.set(event.priceKey, event.priceLabel);

      event.ageKeys.forEach((key, index) => {
        registries.ages.set(key, event.ageLabels[index] ?? titleCase(key));
      });
      event.skillKeys.forEach((key, index) => {
        registries.skills.set(key, event.skillLabels[index] ?? titleCase(key));
      });
    }

    return registries;
  }, [derivedEvents]);

  const selectedByGroup = useMemo<Record<FilterGroupKey, string[]>>(
    () => ({
      sports: selectedSports,
      types: selectedTypes,
      locations: selectedLocations,
      ages: selectedAges,
      skills: selectedSkills,
      prices: selectedPrices,
    }),
    [selectedSports, selectedTypes, selectedLocations, selectedAges, selectedSkills, selectedPrices],
  );

  const matchesFilters = useCallback((event: DerivedEvent, excludingGroup?: FilterGroupKey) => {
    const query = searchTerm.trim().toLowerCase();
    if (query && !event.searchText.includes(query)) {
      return false;
    }

    if (excludingGroup !== "sports" && selectedSports.length > 0 && !selectedSports.includes(event.sportKey)) {
      return false;
    }
    if (excludingGroup !== "types" && selectedTypes.length > 0 && !selectedTypes.includes(event.eventTypeKey)) {
      return false;
    }
    if (excludingGroup !== "locations" && selectedLocations.length > 0 && !selectedLocations.includes(event.locationKey)) {
      return false;
    }
    if (excludingGroup !== "ages" && selectedAges.length > 0 && !selectedAges.some((value) => event.ageKeys.includes(value))) {
      return false;
    }
    if (excludingGroup !== "skills" && selectedSkills.length > 0 && !selectedSkills.some((value) => event.skillKeys.includes(value))) {
      return false;
    }
    if (excludingGroup !== "prices" && selectedPrices.length > 0 && !selectedPrices.includes(event.priceKey)) {
      return false;
    }

    return true;
  }, [searchTerm, selectedSports, selectedTypes, selectedLocations, selectedAges, selectedSkills, selectedPrices]);

  const buildFacetOptions = useCallback((group: FilterGroupKey) => {
    const counts = new Map<string, number>();

    for (const event of derivedEvents.filter((entry) => matchesFilters(entry, group))) {
      const values =
        group === "sports"
          ? [event.sportKey]
          : group === "types"
            ? [event.eventTypeKey]
            : group === "locations"
              ? [event.locationKey]
              : group === "ages"
                ? event.ageKeys
                : group === "skills"
                  ? event.skillKeys
                  : [event.priceKey];

      for (const value of values.filter(Boolean)) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }

    for (const selectedValue of selectedByGroup[group]) {
      if (!counts.has(selectedValue)) {
        counts.set(selectedValue, 0);
      }
    }

    const options = Array.from(counts.entries()).map(([value, count]) => ({
      value,
      label: labelRegistry[group].get(value) ?? titleCase(value),
      count,
    }));

    if (group === "types") {
      return options.sort(
        (left, right) =>
          EVENT_TYPE_ORDER.indexOf(left.value as (typeof EVENT_TYPE_ORDER)[number]) -
            EVENT_TYPE_ORDER.indexOf(right.value as (typeof EVENT_TYPE_ORDER)[number]) ||
          left.label.localeCompare(right.label),
      );
    }

    if (group === "prices") {
      return options.sort(
        (left, right) =>
          PRICE_ORDER.indexOf(left.value as (typeof PRICE_ORDER)[number]) -
            PRICE_ORDER.indexOf(right.value as (typeof PRICE_ORDER)[number]) ||
          left.label.localeCompare(right.label),
      );
    }

    if (group === "ages") {
      return options.sort((left, right) => {
        const leftIndex = AGE_ORDER.indexOf(left.value as (typeof AGE_ORDER)[number]);
        const rightIndex = AGE_ORDER.indexOf(right.value as (typeof AGE_ORDER)[number]);
        if (leftIndex >= 0 || rightIndex >= 0) {
          return (leftIndex >= 0 ? leftIndex : Number.MAX_SAFE_INTEGER) - (rightIndex >= 0 ? rightIndex : Number.MAX_SAFE_INTEGER);
        }
        return left.label.localeCompare(right.label, undefined, { numeric: true });
      });
    }

    if (group === "skills") {
      return options.sort((left, right) => {
        const leftIndex = SKILL_ORDER.indexOf(left.value as (typeof SKILL_ORDER)[number]);
        const rightIndex = SKILL_ORDER.indexOf(right.value as (typeof SKILL_ORDER)[number]);
        return (leftIndex >= 0 ? leftIndex : Number.MAX_SAFE_INTEGER) - (rightIndex >= 0 ? rightIndex : Number.MAX_SAFE_INTEGER);
      });
    }

    return options.sort((left, right) => left.label.localeCompare(right.label));
  }, [derivedEvents, labelRegistry, matchesFilters, selectedByGroup]);

  const sportOptions = useMemo(() => buildFacetOptions("sports"), [buildFacetOptions]);
  const typeOptions = useMemo(() => buildFacetOptions("types"), [buildFacetOptions]);
  const locationOptions = useMemo(() => buildFacetOptions("locations"), [buildFacetOptions]);
  const ageOptions = useMemo(() => buildFacetOptions("ages"), [buildFacetOptions]);
  const skillOptions = useMemo(() => buildFacetOptions("skills"), [buildFacetOptions]);
  const priceOptions = useMemo(() => buildFacetOptions("prices"), [buildFacetOptions]);

  const filteredEvents = useMemo(
    () => derivedEvents.filter((event) => matchesFilters(event)).sort(sortByStartDate),
    [derivedEvents, matchesFilters],
  );

  const filteredCollections = useMemo(() => {
    const aldrichEvents = filteredEvents.filter(
      (event) => event.host_type === "aldrich" || (!event.host_type && heuristicAldrich(event)),
    );

    const featuredEvents = filteredEvents.filter(
      (event) =>
        event.host_type === "featured" ||
        event.host_type === "partner" ||
        (!event.host_type && heuristicFeatured(event)),
    );

    return {
      aldrichEvents,
      featuredEvents,
      allEvents: filteredEvents,
    };
  }, [filteredEvents]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    for (const event of filteredEvents) {
      if (event.startDate) {
        addMonthKeysBetween(months, event.startDate, event.calendarEndDate ?? event.endDate ?? event.startDate);
      }
    }
    return Array.from(months).sort();
  }, [filteredEvents]);

  useEffect(() => {
    if (monthOptions.length === 0) {
      setCalendarMonth("");
      return;
    }

    if (calendarMonth && monthOptions.includes(calendarMonth)) {
      return;
    }

    const currentMonth = getMonthKey(new Date());
    setCalendarMonth(monthOptions.includes(currentMonth) ? currentMonth : monthOptions[0]);
  }, [calendarMonth, monthOptions]);

  const calendarCells = useMemo<CalendarCell[]>(() => {
    if (!calendarMonth) return [];

    const [year, month] = calendarMonth.split("-").map(Number);
    if (!year || !month) return [];

    const firstDay = new Date(Date.UTC(year, month - 1, 1));
    const firstWeekday = firstDay.getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const cells: CalendarCell[] = [];

    for (let index = 0; index < firstWeekday; index += 1) {
      cells.push({
        key: `empty-start-${index}`,
        label: "",
        isEmpty: true,
        isCurrentMonth: false,
        events: [],
      });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(Date.UTC(year, month - 1, day));
      cells.push({
        key: `day-${calendarMonth}-${day}`,
        label: String(day),
        isEmpty: false,
        isCurrentMonth: true,
        events: filteredEvents.filter((event) => eventOccursOnDay(event, date)),
      });
    }

    while (cells.length % 7 !== 0) {
      cells.push({
        key: `empty-end-${cells.length}`,
        label: "",
        isEmpty: true,
        isCurrentMonth: false,
        events: [],
      });
    }

    return cells;
  }, [calendarMonth, filteredEvents]);

  const mobileCalendarDays = useMemo(
    () => calendarCells.filter((cell) => !cell.isEmpty && cell.events.length > 0),
    [calendarCells],
  );

  const clearDirectEventQuery = () => {
    if (!eventIdFromQuery) return;
    const nextParams = new URLSearchParams(window.location.search);
    nextParams.delete("eventId");
    const nextQuery = nextParams.toString();
    setEventIdFromQuery("");
    router.replace(nextQuery ? `/events?${nextQuery}` : "/events", { scroll: false });
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedSports([]);
    setSelectedTypes([]);
    setSelectedLocations([]);
    setSelectedAges([]);
    setSelectedSkills([]);
    setSelectedPrices([]);
  };

  const openEventDetails = (event: EventItem) => {
    if (isRegularAslSundayLeagueEvent(event)) {
      router.push(SUNDAY_LEAGUE_HREF);
      return;
    }
    setDetailEvent(event);
  };

  const openRegistration = (event: EventItem) => {
    if (!event.registration_enabled) {
      setMessage(getSignupUnavailableMessage(event));
      return;
    }
    if (isRegisteredEvent(event.id)) {
      return;
    }
    if (!userId) {
      router.push("/account/create");
      return;
    }
    setModalEventId(event.id);
    setModalTitle(event.title);
    setModalOpen(true);
  };

  const renderEventCard = (event: DerivedEvent) => {
    const isRegistered = isRegisteredEvent(event.id);
    const canRegister = Boolean(event.registration_enabled);
    const isSundayLeague = isRegularAslSundayLeagueEvent(event);

    return (
      <article key={event.id} className="event-card event-card--full">
        <div
          className="event-card__image event-card__image--interactive"
          style={{
            backgroundImage: event.image ? `url(${event.image})` : undefined,
          }}
          role="button"
          tabIndex={0}
          aria-label={`Open details for ${event.title}`}
          onClick={() => openEventDetails(event)}
          onKeyDown={(entry) => {
            if (entry.key === "Enter" || entry.key === " ") {
              entry.preventDefault();
              openEventDetails(event);
            }
          }}
        >
          <span className="event-card__image-badge">
            {formatEventSignupLabel(event.signup_count, event.registration_limit)}
          </span>
        </div>
        <div className="event-card__body">
          <div className="event-card__header">
            <h3 className="event-card__title">{event.title}</h3>
          </div>
          <div className="event-card__meta">
            <div className="event-card__meta-row">
              <span aria-hidden>📅</span>
              <span>{primaryDateLabel(event)}</span>
            </div>
            <div className="event-card__meta-row">
              <span aria-hidden>📍</span>
              <span>{event.location || "Location TBD"}</span>
            </div>
          </div>
          <div className="event-card__actions">
            {isSundayLeague ? (
              <>
                <button className="button ghost" type="button" onClick={() => router.push(SUNDAY_LEAGUE_HREF)}>
                  View Details
                </button>
                <button className="button primary" type="button" onClick={() => router.push(SUNDAY_LEAGUE_HREF)}>
                  Register
                </button>
              </>
            ) : (
              <>
                <button className="button ghost" type="button" onClick={() => openEventDetails(event)}>
                  View Details
                </button>
                <button
                  className="button primary"
                  type="button"
                  onClick={() => openRegistration(event)}
                  disabled={!canRegister || isRegistered}
                >
                  {!canRegister
                    ? getSignupUnavailableLabel(event)
                    : isRegistered
                      ? getSignupSubmittedLabel(event)
                      : getSignupActionLabel(event)}
                </button>
              </>
            )}
          </div>
        </div>
      </article>
    );
  };

  useEffect(() => {
    if (directLinkedEvent && isRegularAslSundayLeagueEvent(directLinkedEvent)) {
      router.replace(SUNDAY_LEAGUE_HREF);
    }
  }, [directLinkedEvent, router]);

  const hasActiveFilters = Boolean(
    searchTerm.trim() ||
      selectedSports.length ||
      selectedTypes.length ||
      selectedLocations.length ||
      selectedAges.length ||
      selectedSkills.length ||
      selectedPrices.length,
  );

  const selectedMonthIndex = monthOptions.findIndex((entry) => entry === calendarMonth);
  const previousMonth = selectedMonthIndex > 0 ? monthOptions[selectedMonthIndex - 1] : null;
  const nextMonth = selectedMonthIndex >= 0 && selectedMonthIndex < monthOptions.length - 1 ? monthOptions[selectedMonthIndex + 1] : null;

  const renderFilterGroup = (
    groupKey: FilterGroupKey,
    title: string,
    options: FacetOption[],
    selectedValues: string[],
    setSelectedValues: (values: string[]) => void,
  ) => {
    if (options.length === 0) return null;

    const isOpen = openFilterGroups[groupKey];

    return (
      <div className="events-filters__group">
        <button
          className="events-filters__toggle"
          type="button"
          aria-expanded={isOpen}
          onClick={() =>
            setOpenFilterGroups((prev) => ({
              ...prev,
              [groupKey]: !prev[groupKey],
            }))
          }
        >
          <h3>{title}</h3>
          <span className={`events-filters__toggle-arrow${isOpen ? " is-open" : ""}`} aria-hidden>
            ▾
          </span>
        </button>
        {isOpen ? (
          <div className="events-filters__options">
            {options.map((option) => (
              <label key={option.value} className="events-filter-option">
                <input
                  type="checkbox"
                  checked={selectedValues.includes(option.value)}
                  onChange={() => setSelectedValues(toggleSelection(selectedValues, option.value))}
                />
                <span>{option.label} ({option.count})</span>
              </label>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const renderResultsSection = (
    id: string,
    eyebrow: string,
    title: string,
    description: string,
    events: DerivedEvent[],
    emptyMessage: string,
  ) => (
    <section className="events-group" id={id}>
      <div className="events-group__header">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="muted">{description}</p>
      </div>
      {events.length > 0 ? (
        <div className="event-card-grid">
          {events.map(renderEventCard)}
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 18 }}>{emptyMessage}</p>
      )}
    </section>
  );

  return (
    <PageShell>
      <Section
        id="events-page"
        eyebrow="Events"
        title="Event Search"
        description="Browse every upcoming event, narrow the list with live filters, or switch into a calendar view to plan your month."
        headingLevel="h1"
        className="events-section"
      >
        {message ? (
          <p className="muted" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
        {loading ? <p className="muted">Loading events...</p> : null}

        {!loading ? (
          <div className="events-discovery">
            <aside className="events-filters">
              <div className="events-filters__header">
                <div>
                  <p className="eyebrow">Filter Events</p>
                  <h2>Refine Results</h2>
                </div>
                {hasActiveFilters ? (
                  <button className="button ghost" type="button" onClick={clearFilters}>
                    Clear Filters
                  </button>
                ) : null}
              </div>

              <div className="events-search">
                <label className="events-search__label" htmlFor="events-search-input">Search events</label>
                <div className="events-search__field">
                  <span className="events-search__icon" aria-hidden />
                  <input
                    id="events-search-input"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Title, sport, location, keyword..."
                  />
                  {searchTerm ? (
                    <button className="events-search__clear" type="button" onClick={() => setSearchTerm("")}>
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>

              {renderFilterGroup("sports", "Sport", sportOptions, selectedSports, setSelectedSports)}
              {renderFilterGroup("types", "Event Type", typeOptions, selectedTypes, setSelectedTypes)}
              {renderFilterGroup("locations", "Location", locationOptions, selectedLocations, setSelectedLocations)}
              {renderFilterGroup("ages", "Age", ageOptions, selectedAges, setSelectedAges)}
              {renderFilterGroup("skills", "Skill Level", skillOptions, selectedSkills, setSelectedSkills)}
              {renderFilterGroup("prices", "Price", priceOptions, selectedPrices, setSelectedPrices)}
            </aside>

            <div className="events-results">
              <div className="events-results__toolbar">
                <div>
                  <p className="eyebrow">Results</p>
                  <h2>Showing results for {filteredEvents.length} event{filteredEvents.length === 1 ? "" : "s"}</h2>
                  <p className="muted">
                    {hasActiveFilters
                      ? "These counts update as you combine filters."
                      : "Only filter options with live events are shown."}
                  </p>
                </div>
                <div className="events-results__view-toggle">
                  <button
                    className={`button ${viewMode === "cards" ? "primary" : "ghost"}`}
                    type="button"
                    onClick={() => setViewMode("cards")}
                  >
                    Card View
                  </button>
                  <button
                    className={`button ${viewMode === "calendar" ? "primary" : "ghost"}`}
                    type="button"
                    onClick={() => setViewMode("calendar")}
                  >
                    Calendar View
                  </button>
                </div>
              </div>

              {filteredEvents.length === 0 ? (
                <div className="events-empty-state">
                  <h3>No events match these filters.</h3>
                  <p className="muted">Try removing a few checkboxes or clearing the search.</p>
                </div>
              ) : viewMode === "cards" ? (
                <div className="events-deck">
                  {renderResultsSection(
                    "filtered-aldrich-events",
                    "Aldrich Sports",
                    "Aldrich Events",
                    "Official ASL-hosted tournaments, leagues, showcases, and community runs.",
                    filteredCollections.aldrichEvents,
                    "No Aldrich events match the filters right now.",
                  )}
                  {renderResultsSection(
                    "filtered-featured-events",
                    "Spotlight",
                    "Featured Events",
                    "Partnered events, showcases, and community benefits that match your filters.",
                    filteredCollections.featuredEvents,
                    "No featured events match the filters right now.",
                  )}
                  {renderResultsSection(
                    "filtered-all-events",
                    "Everything Coming Up",
                    "All Events",
                    "The full filtered calendar, sorted by date.",
                    filteredCollections.allEvents,
                    "No events match the filters right now.",
                  )}
                </div>
              ) : (
                <div className="events-calendar">
                  <div className="events-calendar__toolbar">
                    <button
                      className="button ghost"
                      type="button"
                      onClick={() => previousMonth && setCalendarMonth(previousMonth)}
                      disabled={!previousMonth}
                    >
                      Previous
                    </button>
                    <div className="form-control events-calendar__select">
                      <p className="eyebrow">Month</p>
                      <label htmlFor="events-calendar-month" className="sr-only">Month</label>
                      <select
                        id="events-calendar-month"
                        value={calendarMonth}
                        onChange={(event) => setCalendarMonth(event.target.value)}
                        disabled={monthOptions.length <= 1}
                      >
                        {monthOptions.map((option) => (
                          <option key={option} value={option}>
                            {formatMonthLabel(option)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      className="button ghost"
                      type="button"
                      onClick={() => nextMonth && setCalendarMonth(nextMonth)}
                      disabled={!nextMonth}
                    >
                      Next
                    </button>
                  </div>

                  <div className="events-calendar__desktop">
                    <div className="events-calendar__weekdays">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                        <span key={label}>{label}</span>
                      ))}
                    </div>

                    <div className="events-calendar__grid">
                      {calendarCells.map((cell) => (
                        <div
                          key={cell.key}
                          className={`events-calendar__cell${cell.isEmpty ? " is-empty" : ""}`}
                        >
                          {!cell.isEmpty ? <span className="events-calendar__day">{cell.label}</span> : null}
                          <div className="events-calendar__events">
                            {cell.events.slice(0, 3).map((event) => (
                              <button
                                key={`${cell.key}-${event.id}`}
                                className="events-calendar__event"
                                type="button"
                                onClick={() => openEventDetails(event)}
                              >
                                <span>{event.title}</span>
                                <small>{event.time_info?.trim() || event.eventTypeLabel}</small>
                              </button>
                            ))}
                            {cell.events.length > 3 ? (
                              <span className="events-calendar__more">+{cell.events.length - 3} more</span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="events-calendar__mobile-list">
                    {mobileCalendarDays.length > 0 ? mobileCalendarDays.map((cell) => (
                      <section key={`mobile-${cell.key}`} className="events-calendar__mobile-day">
                        <div className="events-calendar__mobile-day-header">
                          <div>
                            <p className="events-calendar__mobile-day-date">
                              {formatCalendarDayHeading(calendarMonth, cell.label)}
                            </p>
                            <p className="events-calendar__mobile-day-count">
                              {cell.events.length} event{cell.events.length === 1 ? "" : "s"}
                            </p>
                          </div>
                          <span className="events-calendar__mobile-day-number">{cell.label}</span>
                        </div>
                        <div className="events-calendar__mobile-events">
                          {cell.events.map((event) => (
                            <button
                              key={`mobile-${cell.key}-${event.id}`}
                              className="events-calendar__mobile-event"
                              type="button"
                              onClick={() => openEventDetails(event)}
                            >
                              <strong>{event.title}</strong>
                              <span>{event.time_info?.trim() || primaryDateLabel(event)}</span>
                              <small>{event.location || "Location TBD"}</small>
                            </button>
                          ))}
                        </div>
                      </section>
                    )) : (
                      <p className="muted">No events fall in this month.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Section>

      <RegistrationModal
        open={modalOpen}
        eventId={modalEventId}
        contextTitle={modalTitle ?? undefined}
        onClose={() => setModalOpen(false)}
        onSubmitted={refreshRegisteredEvents}
      />
      <EventDetailModal
        open={Boolean(activeDetailEvent)}
        event={activeDetailEvent}
        dateLabel={activeDetailEvent ? primaryDateLabel(activeDetailEvent) : undefined}
        isRegistered={isRegisteredEvent(activeDetailEvent?.id)}
        onClose={() => {
          setDetailEvent(null);
          clearDirectEventQuery();
        }}
        onRegister={(event) => {
          if (!event.registration_enabled) {
            setMessage(getSignupUnavailableMessage(event));
            return;
          }
          if (isRegisteredEvent(event.id)) {
            return;
          }
          if (!userId) {
            router.push("/account/create");
            return;
          }
          setDetailEvent(null);
          clearDirectEventQuery();
          setModalEventId(event.id);
          setModalTitle(event.title);
          setModalOpen(true);
        }}
      />
    </PageShell>
  );
}
