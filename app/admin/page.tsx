"use client";

import Link from "next/link";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";

import { AccessibilityControls } from "@/components/accessibility-controls";
import { HistoryBackButton } from "@/components/history-back-button";
import { SubmissionReviewModal } from "@/components/submission-review-modal";
import { createId } from "@/lib/create-id";
import type { SignupMode } from "@/lib/event-signups";
import { parseSportSectionHeaders, slugifySportValue } from "@/lib/sports";
import { supabase } from "@/lib/supabase/client";
import type { Event, Flyer, JsonValue, Sport } from "@/lib/supabase/types";

type AccessStatus = "loading" | "allowed" | "no-session" | "forbidden";
type FormStatus = { type: "idle" | "loading" | "success" | "error"; message?: string };
type AdminModule =
  | "none"
  | "events"
  | "community"
  | "contact"
  | "sports"
  | "registrations"
  | "users"
  | "flyers"
  | "settings";
type HostType = NonNullable<Event["host_type"]>;
const EVENT_IMAGE_BUCKET = "event-creation-uploads";
type RegistrationFieldType = "text" | "email" | "tel" | "number" | "select" | "textarea" | "checkbox" | "file";
type RegistrationFieldEditor = {
  id: string;
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  placeholder: string;
  optionsText: string;
  expanded: boolean;
};
type EventFormState = {
  title: string;
  start_date: string;
  end_date: string;
  time_info: string;
  location: string;
  description: string;
  host_type: HostType;
  image_url: string;
  signup_mode: SignupMode;
  registration_program_slug: string;
  registration_enabled: boolean;
  waiver_url: string;
  registration_limit: string;
  require_waiver: boolean;
  registration_fields: RegistrationFieldEditor[];
};
type SportGender = NonNullable<Sport["gender"]>;
type SportFormState = {
  title: string;
  players_per_team: string;
  gender: SportGender;
  short_description: string;
  section_headers: string;
  image_url: string;
};
type CommunityArticle = {
  id: string;
  title: string;
  blurb: string;
  href: string;
  date?: string;
  image?: string;
};
type RegistrationRecord = {
  id: string;
  submitted_at?: string | null;
  user_id: string;
  user_name: string;
  user_email: string;
  user_phone?: string | null;
  answers?: Record<string, JsonValue | undefined> | null;
  attachments?: string[] | null;
  waiver_accepted?: boolean | null;
  event_id: string;
  event_title: string;
  signup_mode: SignupMode;
};
type ContactMessage = {
  id: string;
  name: string;
  email: string;
  message: string;
  is_read?: boolean | null;
  read_at?: string | null;
  created_at?: string | null;
};
type UserDirectoryRecord = {
  id: string;
  name: string;
  role?: "player" | "admin" | "owner" | null;
  age?: string | null;
  sports?: string[] | null;
  suspended?: boolean | null;
  suspended_at?: string | null;
  suspension_reason?: string | null;
  created_at?: string | null;
};
type UserRole = "player" | "admin" | "owner";
type UserManageForm = {
  role: UserRole;
  status: "active" | "suspended";
  reason: string;
};
type ContactFilter = "all" | "unread" | "read";

const FLYER_BUCKET = "flyers";
const SPORT_GENDER_OPTIONS: SportGender[] = ["open", "coed", "men", "women"];
const FIELD_TYPE_OPTIONS: RegistrationFieldType[] = [
  "text",
  "email",
  "tel",
  "number",
  "select",
  "textarea",
  "checkbox",
  "file",
];

const isMissingContactReadColumnError = (message?: string | null) =>
  typeof message === "string" &&
  (message.includes("Could not find the 'is_read' column") ||
    message.includes("Could not find the 'read_at' column") ||
    message.includes("column contact_messages.is_read does not exist") ||
    message.includes("column contact_messages.read_at does not exist") ||
    message.includes("schema cache"));

const slugifyFieldName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const createEmptyRegistrationField = (): RegistrationFieldEditor => ({
  id: createId(),
  label: "",
  type: "text",
  required: false,
  placeholder: "",
  optionsText: "",
  expanded: false,
});

const parseRegistrationSchemaState = (value: Event["registration_schema"]): Pick<EventFormState, "require_waiver" | "registration_fields"> => {
  const schema = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const rawFields = Array.isArray(schema?.fields) ? schema.fields : Array.isArray(value) ? value : [];
  const registrationFields = rawFields.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const field = entry as Record<string, unknown>;
    const type = FIELD_TYPE_OPTIONS.includes(field.type as RegistrationFieldType) ? (field.type as RegistrationFieldType) : "text";
    return [{
      id: typeof field.id === "string" && field.id ? field.id : createId(),
      label: typeof field.label === "string" ? field.label : "",
      type,
      required: Boolean(field.required),
      placeholder: typeof field.placeholder === "string" ? field.placeholder : "",
      optionsText: Array.isArray(field.options) ? field.options.filter((option): option is string => typeof option === "string").join("\n") : "",
      expanded: false,
    }];
  });

  return {
    require_waiver: Boolean(schema?.require_waiver),
    registration_fields: registrationFields,
  };
};

const buildRegistrationSchema = (formState: EventFormState) => {
  const fields = formState.registration_fields
    .map((field) => {
      const label = field.label.trim();
      const name = slugifyFieldName(label);
      if (!label || !name) return null;
      return {
        id: field.id,
        label,
        name,
        type: field.type,
        required: field.required,
        placeholder: field.placeholder.trim() || undefined,
        options: field.type === "select"
          ? field.optionsText.split("\n").map((option) => option.trim()).filter(Boolean)
          : undefined,
      };
    })
    .filter(Boolean);

  if (!formState.require_waiver && fields.length === 0) {
    return null;
  }

  return {
    require_waiver: formState.require_waiver,
    fields,
  };
};

const createEmptySportForm = (): SportFormState => ({
  title: "",
  players_per_team: "",
  gender: "open",
  short_description: "",
  section_headers: "",
  image_url: "",
});

const mapSportToForm = (sport: Sport): SportFormState => ({
  title: sport.title ?? "",
  players_per_team: sport.players_per_team?.toString() ?? "",
  gender: sport.gender ?? "open",
  short_description: sport.short_description ?? "",
  section_headers: parseSportSectionHeaders(sport.section_headers).join("\n"),
  image_url: sport.image_url ?? "",
});

export default function AdminPage() {
  const [status, setStatus] = useState<AccessStatus>("loading");
  const [activeModule, setActiveModule] = useState<AdminModule>("none");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingSports, setLoadingSports] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingSportId, setDeletingSportId] = useState<string | null>(null);
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [savingSportEditId, setSavingSportEditId] = useState<string | null>(null);
  const [uploadingCreateImage, setUploadingCreateImage] = useState(false);
  const [uploadingEditImageId, setUploadingEditImageId] = useState<string | null>(null);
  const [uploadingCreateSportImage, setUploadingCreateSportImage] = useState(false);
  const [uploadingEditSportImageId, setUploadingEditSportImageId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSportId, setEditingSportId] = useState<string | null>(null);
  const [showCreateEventForm, setShowCreateEventForm] = useState(false);
  const [showCreateSportForm, setShowCreateSportForm] = useState(false);
  const [showCreateArticleForm, setShowCreateArticleForm] = useState(false);
  const [showCommunityContentForm, setShowCommunityContentForm] = useState(false);
  const [formStatus, setFormStatus] = useState<FormStatus>({ type: "idle" });
  const [sportsStatus, setSportsStatus] = useState<FormStatus>({ type: "idle" });
  const [communityStatus, setCommunityStatus] = useState<FormStatus>({ type: "idle" });
  const [communityContentStatus, setCommunityContentStatus] = useState<FormStatus>({ type: "idle" });
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [sportsError, setSportsError] = useState<string | null>(null);
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [loadingFlyers, setLoadingFlyers] = useState(false);
  const [flyersError, setFlyersError] = useState<string | null>(null);
  const [flyersStatus, setFlyersStatus] = useState<FormStatus>({ type: "idle" });
  const [uploadingFlyerEventId, setUploadingFlyerEventId] = useState<string | null>(null);
  const [savingFlyerEventId, setSavingFlyerEventId] = useState<string | null>(null);
  const [deletingFlyerEventId, setDeletingFlyerEventId] = useState<string | null>(null);
  const [flyerDetailsDrafts, setFlyerDetailsDrafts] = useState<Record<string, string>>({});
  const [expandedFlyerPreviews, setExpandedFlyerPreviews] = useState<Record<string, boolean>>({});
  const [communityArticles, setCommunityArticles] = useState<CommunityArticle[]>([]);
  const [loadingCommunity, setLoadingCommunity] = useState(false);
  const [registrations, setRegistrations] = useState<RegistrationRecord[]>([]);
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);
  const [registrationsError, setRegistrationsError] = useState<string | null>(null);
  const [selectedRegistrationEventId, setSelectedRegistrationEventId] = useState<string | null>(null);
  const [selectedRegistrationSubmissionId, setSelectedRegistrationSubmissionId] = useState<string | null>(null);
  const [registrationsEventFilter, setRegistrationsEventFilter] = useState("all");
  const [registrationsUserFilter, setRegistrationsUserFilter] = useState("");
  const [createRegistrationFieldsVisible, setCreateRegistrationFieldsVisible] = useState(false);
  const [editRegistrationFieldsVisible, setEditRegistrationFieldsVisible] = useState(false);
  const [contactMessages, setContactMessages] = useState<ContactMessage[]>([]);
  const [loadingContactMessages, setLoadingContactMessages] = useState(false);
  const [contactMessagesError, setContactMessagesError] = useState<string | null>(null);
  const [contactFilter, setContactFilter] = useState<ContactFilter>("all");
  const [contactSearch, setContactSearch] = useState("");
  const [savingContactMessageId, setSavingContactMessageId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserDirectoryRecord[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersSearch, setUsersSearch] = useState("");
  const [usersStatus, setUsersStatus] = useState<FormStatus>({ type: "idle" });
  const [manageUser, setManageUser] = useState<UserDirectoryRecord | null>(null);
  const [manageForm, setManageForm] = useState<UserManageForm>({
    role: "player",
    status: "active",
    reason: "",
  });
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [autoFillingCreateArticle, setAutoFillingCreateArticle] = useState(false);
  const [autoFillingEditArticleId, setAutoFillingEditArticleId] = useState<string | null>(null);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [communityForm, setCommunityForm] = useState({
    title: "",
    blurb: "",
    href: "",
    date: "",
    image: "",
  });
  const [communityEditForm, setCommunityEditForm] = useState({
    title: "",
    blurb: "",
    href: "",
    date: "",
    image: "",
  });
  const [communityContentForm, setCommunityContentForm] = useState({
    boardTitle: "",
    body: "",
  });
  const [form, setForm] = useState<EventFormState>({
    title: "",
    start_date: "",
    end_date: "",
    time_info: "",
    location: "",
    description: "",
    host_type: "aldrich",
    image_url: "",
    signup_mode: "registration",
    registration_program_slug: "",
    registration_enabled: false,
    waiver_url: "",
    registration_limit: "",
    require_waiver: false,
    registration_fields: [],
  });
  const [editForm, setEditForm] = useState<EventFormState>({
    title: "",
    start_date: "",
    end_date: "",
    time_info: "",
    location: "",
    description: "",
    host_type: "aldrich",
    image_url: "",
    signup_mode: "registration",
    registration_program_slug: "",
    registration_enabled: false,
    waiver_url: "",
    registration_limit: "",
    require_waiver: false,
    registration_fields: [],
  });
  const [sportForm, setSportForm] = useState<SportFormState>(createEmptySportForm());
  const [editSportForm, setEditSportForm] = useState<SportFormState>(createEmptySportForm());
  const adminModules: Array<{
    id: Exclude<AdminModule, "none">;
    title: string;
    description: string;
    enabled: boolean;
  }> = [
    {
      id: "events",
      title: "Events",
      description: "Create, edit, and remove site events.",
      enabled: true,
    },
    {
      id: "community",
      title: "Community",
      description: "Add featured community/news articles.",
      enabled: true,
    },
    {
      id: "contact",
      title: "Contact Messages",
      description: "Review inbound contact form submissions.",
      enabled: true,
    },
    {
      id: "sports",
      title: "Sports",
      description: "Manage sports pages and configurations.",
      enabled: true,
    },
    {
      id: "registrations",
      title: "Registrations",
      description: "Review and manage event signups.",
      enabled: true,
    },
    {
      id: "users",
      title: "Users",
      description: "View all users from the profiles table.",
      enabled: true,
    },
    {
      id: "flyers",
      title: "Flyers",
      description: "Upload and manage event flyers.",
      enabled: true,
    },
    {
      id: "settings",
      title: "Settings",
      description: "Global admin and site settings.",
      enabled: false,
    },
  ];

  const loadEvents = async () => {
    if (!supabase) return;
    setLoadingEvents(true);
    setEventsError(null);
    const { data, error } = await supabase
      .from("events")
      .select("id,title,start_date,end_date,time_info,location,description,host_type,image_url,signup_mode,registration_program_slug,registration_enabled,waiver_url,allow_multiple_registrations,registration_limit,registration_schema")
      .order("start_date", { ascending: true, nullsFirst: false });

    if (!error && data) {
      setEvents(data as Event[]);
    } else {
      setEvents([]);
      setEventsError(error?.message ?? "Could not load events.");
    }
    setLoadingEvents(false);
  };

  const loadSports = async () => {
    if (!supabase) return;
    setLoadingSports(true);
    setSportsError(null);

    const { data, error } = await supabase
      .from("sports")
      .select("*")
      .order("title", { ascending: true });

    if (error) {
      setSports([]);
      setSportsError(error.message ?? "Could not load sports.");
    } else {
      setSports((data ?? []) as Sport[]);
    }

    setLoadingSports(false);
  };

  const loadFlyers = async () => {
    if (!supabase) return;
    setLoadingFlyers(true);
    setFlyersError(null);

    const { data, error } = await supabase
      .from("flyers")
      .select("id,event_id,flyer_name,flyer_image_url,details,created_at,updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      setFlyers([]);
      setFlyersError(error.message ?? "Could not load flyers.");
      setLoadingFlyers(false);
      return;
    }

    const rows = (data ?? []) as Flyer[];
    setFlyers(rows);
    setFlyerDetailsDrafts(
      rows.reduce<Record<string, string>>((acc, flyer) => {
        if (flyer.event_id) {
          acc[flyer.event_id] = flyer.details ?? "";
        }
        return acc;
      }, {})
    );
    setLoadingFlyers(false);
  };

  const loadCommunityArticles = async () => {
    setLoadingCommunity(true);
    setCommunityStatus({ type: "idle" });
    try {
      const response = await fetch("/api/admin/community-articles");
      const json = await response.json();
      if (!response.ok) {
        setCommunityStatus({ type: "error", message: json?.error ?? "Could not load community articles." });
        setCommunityArticles([]);
      } else {
        setCommunityArticles((json?.articles ?? []) as CommunityArticle[]);
      }
    } catch {
      setCommunityStatus({ type: "error", message: "Could not load community articles." });
      setCommunityArticles([]);
    } finally {
      setLoadingCommunity(false);
    }
  };

  const loadCommunityContent = async () => {
    setCommunityContentStatus({ type: "idle" });
    try {
      const response = await fetch("/api/admin/community-content");
      const json = await response.json();
      if (!response.ok) {
        setCommunityContentStatus({ type: "error", message: json?.error ?? "Could not load community intro." });
        return;
      }
      const content = (json?.content ?? {}) as { boardTitle?: string; paragraphs?: string[] };
      const paragraphs = Array.isArray(content.paragraphs) ? content.paragraphs : [];
      setCommunityContentForm({
        boardTitle: content.boardTitle ?? "",
        body: paragraphs.join("\n\n"),
      });
    } catch {
      setCommunityContentStatus({ type: "error", message: "Could not load community intro." });
    }
  };

  const loadContactMessages = async () => {
    if (!supabase) return;
    setLoadingContactMessages(true);
    setContactMessagesError(null);

    const fullQuery = await supabase
      .from("contact_messages")
      .select("id,name,email,message,is_read,read_at,created_at")
      .order("created_at", { ascending: false });

    if (fullQuery.error && isMissingContactReadColumnError(fullQuery.error.message)) {
      const legacyQuery = await supabase
        .from("contact_messages")
        .select("id,name,email,message,created_at")
        .order("created_at", { ascending: false });

      if (legacyQuery.error) {
        setContactMessages([]);
        setContactMessagesError(legacyQuery.error.message ?? "Could not load contact messages.");
      } else {
        setContactMessages((legacyQuery.data ?? []) as ContactMessage[]);
      }
    } else if (fullQuery.error) {
      setContactMessages([]);
      setContactMessagesError(fullQuery.error.message ?? "Could not load contact messages.");
    } else {
      setContactMessages((fullQuery.data ?? []) as ContactMessage[]);
    }

    setLoadingContactMessages(false);
  };

  const markContactMessageRead = async (messageId: string) => {
    if (!supabase) return;
    setSavingContactMessageId(messageId);
    setContactMessagesError(null);

    const readAt = new Date().toISOString();
    const { error } = await supabase
      .from("contact_messages")
      .update({
        is_read: true,
        read_at: readAt,
      })
      .eq("id", messageId);

    if (error) {
      if (isMissingContactReadColumnError(error.message)) {
        setContactMessages((prev) =>
          prev.map((message) => (message.id === messageId ? { ...message, is_read: true, read_at: readAt } : message))
        );
        setContactMessagesError("Read status needs the latest Supabase migration to persist after refresh.");
      } else {
        setContactMessagesError(error.message ?? "Could not update message.");
      }
      setSavingContactMessageId(null);
      return;
    }

    setContactMessages((prev) =>
      prev.map((message) => (message.id === messageId ? { ...message, is_read: true, read_at: readAt } : message))
    );
    setSavingContactMessageId(null);
  };

  const loadRegistrations = async () => {
    if (!supabase) return;
    setLoadingRegistrations(true);
    setRegistrationsError(null);

    const { data: submissionData, error: submissionError } = await supabase
      .from("event_submissions")
      .select("id,event_id,user_id,name,email,phone,answers,attachments,waiver_accepted,created_at")
      .order("created_at", { ascending: false });

    if (submissionError) {
      setRegistrations([]);
      setRegistrationsError(submissionError.message ?? "Could not load registrations.");
      setLoadingRegistrations(false);
      return;
    }

    const submissions = (submissionData ?? []) as Array<{
      id: string;
      event_id: string;
      user_id: string;
      name: string;
      email: string;
      phone?: string | null;
      answers?: Record<string, JsonValue | undefined> | null;
      attachments?: string[] | null;
      waiver_accepted?: boolean | null;
      created_at?: string | null;
    }>;

    if (submissions.length === 0) {
      setRegistrations([]);
      setSelectedRegistrationEventId(null);
      setLoadingRegistrations(false);
      return;
    }

    const userIds = Array.from(new Set(submissions.map((row) => row.user_id).filter(Boolean)));

    const [{ data: eventsData, error: eventsError }, { data: profilesData, error: profilesError }] =
      await Promise.all([
        supabase
          .from("events")
          .select("id,title,signup_mode")
          .in("id", Array.from(new Set(submissions.map((row) => row.event_id).filter(Boolean)))),
        supabase
          .from("profiles")
          .select("id,name")
          .in("id", userIds),
      ]);

    if (eventsError || profilesError) {
      setRegistrations([]);
      setRegistrationsError(eventsError?.message || profilesError?.message || "Could not load registrations.");
      setLoadingRegistrations(false);
      return;
    }

    const profiles = (profilesData ?? []) as Array<{ id: string; name: string | null }>;
    const profileById = new Map(profiles.map((row) => [row.id, row]));
    const eventById = new Map(
      ((eventsData ?? []) as Array<{ id: string; title: string; signup_mode?: SignupMode | null }>).map((row) => [row.id, row])
    );

    const resolved: RegistrationRecord[] = submissions.map((row) => {
      const profile = profileById.get(row.user_id);
      const eventInfo = eventById.get(row.event_id);
      return {
        id: row.id,
        submitted_at: row.created_at ?? null,
        user_id: row.user_id,
        user_name: profile?.name?.trim() || row.name || "Unknown user",
        user_email: row.email,
        user_phone: row.phone ?? null,
        answers: row.answers ?? null,
        attachments: row.attachments ?? null,
        waiver_accepted: row.waiver_accepted ?? false,
        event_id: row.event_id,
        event_title: eventInfo?.title ?? "Unknown event",
        signup_mode: eventInfo?.signup_mode === "waitlist" ? "waitlist" : "registration",
      };
    });

    setRegistrations(resolved);
    setSelectedRegistrationEventId((current) =>
      current && resolved.some((row) => row.event_id === current) ? current : null
    );
    setLoadingRegistrations(false);
  };

  const loadUsers = async () => {
    if (!supabase) return;
    setLoadingUsers(true);
    setUsersError(null);
    setUsersStatus({ type: "idle" });

    const { data, error } = await supabase
      .from("profiles")
      .select("id,name,role,age,sports,suspended,suspended_at,suspension_reason")
      .order("name", { ascending: true });

    if (error) {
      setUsers([]);
      setUsersError(error.message ?? "Could not load users.");
    } else {
      setUsers((data ?? []) as UserDirectoryRecord[]);
    }

    setLoadingUsers(false);
  };

  useEffect(() => {
    const loadAccess = async () => {
      if (!supabase) {
        setStatus("forbidden");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;

      if (!userId) {
        setStatus("no-session");
        return;
      }
      setCurrentUserId(userId);

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      const role = (profile?.role ?? null) as UserRole | null;
      setCurrentUserRole(role);
      if (role === "admin" || role === "owner") {
        setStatus("allowed");
        return;
      }

      setStatus("forbidden");
    };

    void loadAccess();
  }, []);

  useEffect(() => {
    if (!manageUser) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeManageUser();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [manageUser]);

  const update = <K extends keyof EventFormState>(key: K, value: EventFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateSport = <K extends keyof SportFormState>(key: K, value: SportFormState[K]) => {
    setSportForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm({
      title: "",
      start_date: "",
      end_date: "",
      time_info: "",
      location: "",
      description: "",
      host_type: "aldrich",
      image_url: "",
      signup_mode: "registration",
      registration_program_slug: "",
      registration_enabled: false,
      waiver_url: "",
      registration_limit: "",
      require_waiver: false,
      registration_fields: [],
    });
  };

  const resetSportForm = () => {
    setSportForm(createEmptySportForm());
  };

  const openCreateEventForm = () => {
    resetForm();
    setCreateRegistrationFieldsVisible(false);
    setFormStatus({ type: "idle" });
    setShowCreateEventForm(true);
  };

  const openCreateSportForm = () => {
    resetSportForm();
    setSportsStatus({ type: "idle" });
    setShowCreateSportForm(true);
  };

  const closeCreateEventForm = () => {
    resetForm();
    setCreateRegistrationFieldsVisible(false);
    setFormStatus({ type: "idle" });
    setShowCreateEventForm(false);
  };

  const closeCreateSportForm = () => {
    resetSportForm();
    setSportsStatus({ type: "idle" });
    setShowCreateSportForm(false);
  };

  const startEditing = (event: Event) => {
    const registrationState = parseRegistrationSchemaState(event.registration_schema);
    setEditingId(event.id);
    setEditRegistrationFieldsVisible(false);
    setEditForm({
      title: event.title ?? "",
      start_date: event.start_date ?? "",
      end_date: event.end_date ?? "",
      time_info: event.time_info ?? "",
      location: event.location ?? "",
      description: event.description ?? "",
      host_type: event.host_type ?? "aldrich",
      image_url: event.image_url ?? "",
      signup_mode: event.signup_mode === "waitlist" ? "waitlist" : "registration",
      registration_program_slug: event.registration_program_slug ?? "",
      registration_enabled: Boolean(event.registration_enabled),
      waiver_url: event.waiver_url ?? "",
      registration_limit: event.registration_limit?.toString() ?? "",
      require_waiver: registrationState.require_waiver,
      registration_fields: registrationState.registration_fields,
    });
    setFormStatus({ type: "idle" });
  };

  const startEditingSport = (sport: Sport) => {
    setEditingSportId(sport.id);
    setEditSportForm(mapSportToForm(sport));
    setSportsStatus({ type: "idle" });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditRegistrationFieldsVisible(false);
  };

  const cancelEditingSport = () => {
    setEditingSportId(null);
  };

  const updateEdit = <K extends keyof EventFormState>(key: K, value: EventFormState[K]) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateEditSport = <K extends keyof SportFormState>(key: K, value: SportFormState[K]) => {
    setEditSportForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateRegistrationField = (
    target: "create" | "edit",
    fieldId: string,
    key: keyof RegistrationFieldEditor,
    value: RegistrationFieldEditor[keyof RegistrationFieldEditor]
  ) => {
    const apply = (prev: EventFormState) => ({
      ...prev,
      registration_fields: prev.registration_fields.map((field) => {
        if (field.id !== fieldId) return field;
        return { ...field, [key]: value } as RegistrationFieldEditor;
      }),
    });

    if (target === "create") {
      setForm(apply);
      return;
    }
    setEditForm(apply);
  };

  const addRegistrationField = (target: "create" | "edit") => {
    const apply = (prev: EventFormState) => ({
      ...prev,
      registration_fields: [...prev.registration_fields, createEmptyRegistrationField()],
    });
    if (target === "create") {
      setForm(apply);
      return;
    }
    setEditForm(apply);
  };

  const toggleRegistrationFieldExpanded = (target: "create" | "edit", fieldId: string) => {
    const apply = (prev: EventFormState) => ({
      ...prev,
      registration_fields: prev.registration_fields.map((field) =>
        field.id === fieldId ? { ...field, expanded: !field.expanded } : field
      ),
    });

    if (target === "create") {
      setForm(apply);
      return;
    }
    setEditForm(apply);
  };

  const collapseRegistrationField = (target: "create" | "edit", fieldId: string) => {
    const apply = (prev: EventFormState) => ({
      ...prev,
      registration_fields: prev.registration_fields.map((field) =>
        field.id === fieldId ? { ...field, expanded: false } : field
      ),
    });

    if (target === "create") {
      setForm(apply);
      return;
    }
    setEditForm(apply);
  };

  const setAllRegistrationFieldsExpanded = (target: "create" | "edit", expanded: boolean) => {
    const apply = (prev: EventFormState) => ({
      ...prev,
      registration_fields: prev.registration_fields.map((field) => ({ ...field, expanded })),
    });

    if (target === "create") {
      setForm(apply);
      return;
    }
    setEditForm(apply);
  };

  const removeRegistrationField = (target: "create" | "edit", fieldId: string) => {
    const apply = (prev: EventFormState) => ({
      ...prev,
      registration_fields: prev.registration_fields.filter((field) => field.id !== fieldId),
    });
    if (target === "create") {
      setForm(apply);
      return;
    }
    setEditForm(apply);
  };

  const moveRegistrationField = (target: "create" | "edit", fieldId: string, direction: -1 | 1) => {
    const apply = (prev: EventFormState) => {
      const index = prev.registration_fields.findIndex((field) => field.id === fieldId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.registration_fields.length) {
        return prev;
      }
      const nextFields = [...prev.registration_fields];
      const [field] = nextFields.splice(index, 1);
      nextFields.splice(nextIndex, 0, field);
      return { ...prev, registration_fields: nextFields };
    };

    if (target === "create") {
      setForm(apply);
      return;
    }
    setEditForm(apply);
  };

  const renderRegistrationBuilder = (target: "create" | "edit", state: EventFormState) => {
    const fieldsVisible = target === "create" ? createRegistrationFieldsVisible : editRegistrationFieldsVisible;
    const setFieldsVisible = target === "create" ? setCreateRegistrationFieldsVisible : setEditRegistrationFieldsVisible;
    const hasFields = state.registration_fields.length > 0;

    return (
      <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 12 }}>
        <div className="account-card__header">
          <div>
            <h3 style={{ margin: 0 }}>Extra Form Fields</h3>
            <p className="muted" style={{ margin: 0 }}>
              Name, email, and phone are always included automatically.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button ghost" type="button" onClick={() => setFieldsVisible(!fieldsVisible)}>
            {fieldsVisible ? "Collapse all" : "Expand all"}
          </button>
          {fieldsVisible ? (
            <button className="button ghost" type="button" onClick={() => addRegistrationField(target)}>
              Add field
            </button>
          ) : null}
        </div>

        {!fieldsVisible ? (
          <p className="muted">
            {hasFields
              ? `${state.registration_fields.length} extra field${state.registration_fields.length === 1 ? "" : "s"} hidden.`
              : "Extra fields are hidden."}
          </p>
        ) : state.registration_fields.length === 0 ? (
          <p className="muted">No extra fields yet.</p>
        ) : (
          state.registration_fields.map((field, index) => (
            <div key={field.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <p className="list__title" style={{ margin: 0 }}>
                    {field.label.trim() || `Field ${index + 1}`}
                  </p>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    {slugifyFieldName(field.label) || "no_key"} • {field.type}{field.required ? " • required" : ""}
                  </p>
                </div>
                {!field.expanded ? (
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => toggleRegistrationFieldExpanded(target, field.id)}
                  >
                    Expand
                  </button>
                ) : null}
              </div>

              {field.expanded ? (
                <>
                  <div className="register-form-grid">
                    <div className="form-control">
                      <label htmlFor={`${target}-field-label-${field.id}`}>Field label</label>
                      <input
                        id={`${target}-field-label-${field.id}`}
                        value={field.label}
                        onChange={(e) => updateRegistrationField(target, field.id, "label", e.target.value)}
                        placeholder="Team name"
                      />
                    </div>
                    <div className="form-control">
                      <label htmlFor={`${target}-field-placeholder-${field.id}`}>Placeholder</label>
                      <input
                        id={`${target}-field-placeholder-${field.id}`}
                        value={field.placeholder}
                        onChange={(e) => updateRegistrationField(target, field.id, "placeholder", e.target.value)}
                      />
                    </div>
                    <div className="form-control">
                      <label htmlFor={`${target}-field-type-${field.id}`}>Field type</label>
                      <select
                        id={`${target}-field-type-${field.id}`}
                        value={field.type}
                        onChange={(e) => updateRegistrationField(target, field.id, "type", e.target.value as RegistrationFieldType)}
                      >
                        {FIELD_TYPE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-control checkbox-control" style={{ justifySelf: "start" }}>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => updateRegistrationField(target, field.id, "required", e.target.checked)}
                      />
                      <span>Required field</span>
                    </label>
                  </div>

                  {field.type === "select" ? (
                    <div className="form-control">
                      <label htmlFor={`${target}-field-options-${field.id}`}>Options</label>
                      <textarea
                        id={`${target}-field-options-${field.id}`}
                        value={field.optionsText}
                        onChange={(e) => updateRegistrationField(target, field.id, "optionsText", e.target.value)}
                        rows={4}
                        placeholder={"Rec\nCompetitive"}
                      />
                      <p className="form-help muted">One option per line.</p>
                    </div>
                  ) : null}
                </>
              ) : null}

              <div className="cta-row">
                {field.expanded ? (
                  <button className="button primary" type="button" onClick={() => collapseRegistrationField(target, field.id)}>
                    Save field
                  </button>
                ) : null}
                <button className="button ghost" type="button" onClick={() => moveRegistrationField(target, field.id, -1)} disabled={index === 0}>
                  Move up
                </button>
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => moveRegistrationField(target, field.id, 1)}
                  disabled={index === state.registration_fields.length - 1}
                >
                  Move down
                </button>
                <button className="button ghost" type="button" onClick={() => removeRegistrationField(target, field.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="form-control checkbox-control" style={{ justifySelf: "start" }}>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={state.require_waiver}
            onChange={(e) =>
              target === "create"
                ? update("require_waiver", e.target.checked)
                : updateEdit("require_waiver", e.target.checked)
            }
          />
          <span>Require waiver acceptance in the form</span>
        </label>
      </div>
    </div>
    );
  };

  const handleCreateEvent = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      setFormStatus({ type: "error", message: "Supabase is not configured." });
      return;
    }

    if (!form.title.trim()) {
      setFormStatus({ type: "error", message: "Title is required." });
      return;
    }

    setFormStatus({ type: "loading" });
    const isWaitlist = form.signup_mode === "waitlist";
    const registrationSchema = isWaitlist ? null : buildRegistrationSchema(form);
    const payload = {
      title: form.title.trim(),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      time_info: form.time_info.trim() || null,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
      host_type: form.host_type || null,
      image_url: form.image_url.trim() || null,
      signup_mode: form.signup_mode,
      registration_program_slug: form.registration_program_slug.trim() || null,
      registration_enabled: form.registration_enabled,
      waiver_url: isWaitlist ? null : form.waiver_url.trim() || null,
      allow_multiple_registrations: false,
      registration_limit: isWaitlist ? null : form.registration_limit.trim() ? Number(form.registration_limit) : null,
      registration_schema: registrationSchema,
    };

    const { error } = await supabase.from("events").insert(payload);
    if (error) {
      setFormStatus({ type: "error", message: error.message });
      return;
    }

    setFormStatus({ type: "success", message: "Event created." });
    resetForm();
    setShowCreateEventForm(false);
    await loadEvents();
  };

  const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

  const uploadManagedImage = async (folder: "events" | "sports", file: File) => {
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const baseName = file.name.replace(new RegExp(`\\.${ext}$`, "i"), "");
    const path = `${folder}/${createId()}-${safeFileName(baseName)}.${ext}`;
    const { data, error } = await supabase.storage.from(EVENT_IMAGE_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) throw error;

    const finalPath = data?.path ?? path;
    const { data: publicUrlData } = supabase.storage.from(EVENT_IMAGE_BUCKET).getPublicUrl(finalPath);
    return publicUrlData.publicUrl;
  };

  const handleCreateImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormStatus({ type: "error", message: "Please select a valid image file." });
      return;
    }
    try {
      setUploadingCreateImage(true);
      const publicUrl = await uploadManagedImage("events", file);
      update("image_url", publicUrl);
      setFormStatus({ type: "success", message: "Image uploaded. The generated URL was added to the field. Click Create Event to save it." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload image.";
      setFormStatus({ type: "error", message: `${message} (Bucket: ${EVENT_IMAGE_BUCKET})` });
    } finally {
      setUploadingCreateImage(false);
      e.target.value = "";
    }
  };

  const handleDeleteEvent = async (eventId: string, title: string) => {
    if (!supabase) return;
    const confirmed = window.confirm(`Delete "${title}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingId(eventId);
    const { error } = await supabase.from("events").delete().eq("id", eventId);
    setDeletingId(null);

    if (error) {
      setFormStatus({ type: "error", message: `Could not delete event: ${error.message}` });
      return;
    }

    setFormStatus({ type: "success", message: "Event deleted." });
    await loadEvents();
  };

  const handleSaveEdit = async (eventId: string) => {
    if (!supabase) return;
    if (!editForm.title.trim()) {
      setFormStatus({ type: "error", message: "Title is required." });
      return;
    }

    setSavingEditId(eventId);
    const isWaitlist = editForm.signup_mode === "waitlist";
    const registrationSchema = isWaitlist ? null : buildRegistrationSchema(editForm);
    const payload = {
      title: editForm.title.trim(),
      start_date: editForm.start_date || null,
      end_date: editForm.end_date || null,
      time_info: editForm.time_info.trim() || null,
      location: editForm.location.trim() || null,
      description: editForm.description.trim() || null,
      host_type: editForm.host_type || null,
      image_url: editForm.image_url.trim() || null,
      signup_mode: editForm.signup_mode,
      registration_program_slug: editForm.registration_program_slug.trim() || null,
      registration_enabled: editForm.registration_enabled,
      waiver_url: isWaitlist ? null : editForm.waiver_url.trim() || null,
      allow_multiple_registrations: false,
      registration_limit: isWaitlist ? null : editForm.registration_limit.trim() ? Number(editForm.registration_limit) : null,
      registration_schema: registrationSchema,
    };

    const { error } = await supabase.from("events").update(payload).eq("id", eventId);
    setSavingEditId(null);

    if (error) {
      setFormStatus({ type: "error", message: `Could not update event: ${error.message}` });
      return;
    }

    setFormStatus({ type: "success", message: "Event updated." });
    setEditingId(null);
    await loadEvents();
  };

  const handleEditImageUpload = async (eventId: string, e: ChangeEvent<HTMLInputElement>) => {
    if (!supabase) {
      setFormStatus({ type: "error", message: "Supabase is not configured." });
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormStatus({ type: "error", message: "Please select a valid image file." });
      return;
    }
    try {
      setUploadingEditImageId(eventId);
      const publicUrl = await uploadManagedImage("events", file);
      const { error } = await supabase
        .from("events")
        .update({ image_url: publicUrl })
        .eq("id", eventId);

      if (error) {
        throw error;
      }

      updateEdit("image_url", publicUrl);
      setEvents((prev) => prev.map((item) => (item.id === eventId ? { ...item, image_url: publicUrl } : item)));
      setFormStatus({ type: "success", message: "Image uploaded and saved to this event." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload image.";
      setFormStatus({ type: "error", message: `${message} (Bucket: ${EVENT_IMAGE_BUCKET})` });
    } finally {
      setUploadingEditImageId(null);
      e.target.value = "";
    }
  };

  const buildSportPayload = (state: SportFormState) => {
    const sectionHeaders = state.section_headers
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);

    return {
      title: state.title.trim(),
      players_per_team: state.players_per_team.trim() ? Number(state.players_per_team) : null,
      gender: state.gender || null,
      short_description: state.short_description.trim() || null,
      ...(sectionHeaders.length > 0 ? { section_headers: sectionHeaders } : {}),
      image_url: state.image_url.trim() || null,
    };
  };

  const handleCreateSport = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      setSportsStatus({ type: "error", message: "Supabase is not configured." });
      return;
    }

    if (!sportForm.title.trim()) {
      setSportsStatus({ type: "error", message: "Sport title is required." });
      return;
    }

    const slug = slugifySportValue(sportForm.title);
    if (!slug) {
      setSportsStatus({ type: "error", message: "Sport slug is required." });
      return;
    }

    setSportsStatus({ type: "loading" });
    const { error } = await supabase.from("sports").insert(buildSportPayload(sportForm));

    if (error) {
      setSportsStatus({ type: "error", message: error.message });
      return;
    }

    setSportsStatus({ type: "success", message: "Sport created." });
    resetSportForm();
    setShowCreateSportForm(false);
    await loadSports();
  };

  const handleSaveSportEdit = async (sportId: string) => {
    if (!supabase) return;
    if (!editSportForm.title.trim()) {
      setSportsStatus({ type: "error", message: "Sport title is required." });
      return;
    }

    const slug = slugifySportValue(editSportForm.title);
    if (!slug) {
      setSportsStatus({ type: "error", message: "Sport slug is required." });
      return;
    }

    setSavingSportEditId(sportId);
    const { error } = await supabase.from("sports").update(buildSportPayload(editSportForm)).eq("id", sportId);
    setSavingSportEditId(null);

    if (error) {
      setSportsStatus({ type: "error", message: `Could not update sport: ${error.message}` });
      return;
    }

    setSportsStatus({ type: "success", message: "Sport updated." });
    setEditingSportId(null);
    await loadSports();
  };

  const handleDeleteSport = async (sportId: string, title: string) => {
    if (!supabase) return;
    const confirmed = window.confirm(`Delete "${title}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingSportId(sportId);
    const { error } = await supabase.from("sports").delete().eq("id", sportId);
    setDeletingSportId(null);

    if (error) {
      setSportsStatus({ type: "error", message: `Could not delete sport: ${error.message}` });
      return;
    }

    setSportsStatus({ type: "success", message: "Sport deleted." });
    await loadSports();
  };

  const handleCreateSportImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSportsStatus({ type: "error", message: "Please select a valid image file." });
      return;
    }
    try {
      setUploadingCreateSportImage(true);
      const publicUrl = await uploadManagedImage("sports", file);
      updateSport("image_url", publicUrl);
      setSportsStatus({ type: "success", message: "Image uploaded. The generated URL was added to the field. Click Create Sport to save it." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload image.";
      setSportsStatus({ type: "error", message: `${message} (Bucket: ${EVENT_IMAGE_BUCKET})` });
    } finally {
      setUploadingCreateSportImage(false);
      e.target.value = "";
    }
  };

  const handleEditSportImageUpload = async (sportId: string, e: ChangeEvent<HTMLInputElement>) => {
    if (!supabase) {
      setSportsStatus({ type: "error", message: "Supabase is not configured." });
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSportsStatus({ type: "error", message: "Please select a valid image file." });
      return;
    }

    try {
      setUploadingEditSportImageId(sportId);
      const publicUrl = await uploadManagedImage("sports", file);
      const { error } = await supabase
        .from("sports")
        .update({ image_url: publicUrl })
        .eq("id", sportId);

      if (error) throw error;

      updateEditSport("image_url", publicUrl);
      setSports((prev) => prev.map((item) => (item.id === sportId ? { ...item, image_url: publicUrl } : item)));
      setSportsStatus({ type: "success", message: "Image uploaded and saved to this sport." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload image.";
      setSportsStatus({ type: "error", message: `${message} (Bucket: ${EVENT_IMAGE_BUCKET})` });
    } finally {
      setUploadingEditSportImageId(null);
      e.target.value = "";
    }
  };

  const getFlyerName = (event: Event) => {
    return event.registration_program_slug?.trim() || event.title.trim();
  };

  const uploadFlyerImage = async (event: Event, file: File) => {
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const baseName = file.name.replace(new RegExp(`\\.${ext}$`, "i"), "");
    const path = `events/${event.id}/${createId()}-${safeFileName(baseName)}.${ext}`;
    const { data, error } = await supabase.storage.from(FLYER_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) throw error;

    const finalPath = data?.path ?? path;
    const { data: publicUrlData } = supabase.storage.from(FLYER_BUCKET).getPublicUrl(finalPath);
    return publicUrlData.publicUrl;
  };

  const upsertFlyerRecord = async (event: Event, patch: Partial<Flyer>) => {
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }

    const current = flyers.find((flyer) => flyer.event_id === event.id);
    const payload = {
      event_id: event.id,
      flyer_name: getFlyerName(event),
      flyer_image_url: patch.flyer_image_url ?? current?.flyer_image_url ?? null,
      details: patch.details ?? current?.details ?? null,
    };

    const query = current
      ? supabase.from("flyers").update(payload).eq("id", current.id)
      : supabase.from("flyers").insert(payload);

    const { error } = await query;
    if (error) throw error;
    await loadFlyers();
  };

  const handleFlyerUpload = async (event: Event, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFlyersStatus({ type: "error", message: "Please select a valid flyer image file." });
      return;
    }

    try {
      setUploadingFlyerEventId(event.id);
      const publicUrl = await uploadFlyerImage(event, file);
      await upsertFlyerRecord(event, {
        flyer_image_url: publicUrl,
        details: flyerDetailsDrafts[event.id] ?? flyers.find((flyer) => flyer.event_id === event.id)?.details ?? null,
      });
      setFlyersStatus({ type: "success", message: `Flyer uploaded for ${event.title}.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload flyer.";
      setFlyersStatus({ type: "error", message: `${message} (Bucket: ${FLYER_BUCKET})` });
    } finally {
      setUploadingFlyerEventId(null);
      e.target.value = "";
    }
  };

  const handleSaveFlyerDetails = async (event: Event) => {
    try {
      setSavingFlyerEventId(event.id);
      await upsertFlyerRecord(event, {
        details: flyerDetailsDrafts[event.id]?.trim() || null,
      });
      setFlyersStatus({ type: "success", message: `Flyer details saved for ${event.title}.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save flyer details.";
      setFlyersStatus({ type: "error", message: message });
    } finally {
      setSavingFlyerEventId(null);
    }
  };

  const handleDeleteFlyer = async (event: Event) => {
    if (!supabase) return;
    const current = flyers.find((flyer) => flyer.event_id === event.id);
    if (!current) return;

    const confirmed = window.confirm(`Delete the flyer for "${event.title}"?`);
    if (!confirmed) return;

    try {
      setDeletingFlyerEventId(event.id);
      const { error } = await supabase.from("flyers").delete().eq("id", current.id);
      if (error) throw error;
      setFlyerDetailsDrafts((prev) => ({ ...prev, [event.id]: "" }));
      await loadFlyers();
      setFlyersStatus({ type: "success", message: `Flyer removed for ${event.title}.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete flyer.";
      setFlyersStatus({ type: "error", message: message });
    } finally {
      setDeletingFlyerEventId(null);
    }
  };

  const dateLabel = (start?: string | null, end?: string | null) => {
    if (!start && !end) return "Date TBD";
    if (start && end && start !== end) return `${start} to ${end}`;
    return start || end || "Date TBD";
  };

  const openModule = (module: Exclude<AdminModule, "none">, enabled: boolean) => {
    if (!enabled) return;
    setActiveModule(module);
    if (module === "events") {
      void loadEvents();
    }
    if (module === "sports") {
      void loadSports();
    }
    if (module === "registrations") {
      void loadRegistrations();
    }
    if (module === "community") {
      void loadCommunityArticles();
      void loadCommunityContent();
    }
    if (module === "flyers") {
      void loadEvents();
      void loadFlyers();
    }
    if (module === "contact") {
      void loadContactMessages();
    }
    if (module === "users") {
      void loadUsers();
    }
  };

  const openManageUser = (user: UserDirectoryRecord) => {
    setManageUser(user);
    setManageForm({
      role: (user.role ?? "player") as UserRole,
      status: user.suspended ? "suspended" : "active",
      reason: user.suspension_reason ?? "",
    });
    setUsersStatus({ type: "idle" });
  };

  const closeManageUser = () => {
    setManageUser(null);
    setManageForm({ role: "player", status: "active", reason: "" });
  };

  const saveManagedUser = async () => {
    if (!supabase || !manageUser) return;

    if (manageUser.id === currentUserId && manageForm.role !== currentUserRole) {
      setUsersStatus({ type: "error", message: "You cannot change your own role." });
      return;
    }
    if (manageUser.id === currentUserId && manageForm.status === "suspended") {
      setUsersStatus({ type: "error", message: "You cannot suspend your own account." });
      return;
    }
    if (currentUserRole !== "owner" && manageUser.role === "owner" && manageUser.id !== currentUserId) {
      setUsersStatus({ type: "error", message: "Only owners can manage other owner accounts." });
      return;
    }

    setSavingUserId(manageUser.id);
    setUsersStatus({ type: "loading" });

    const suspended = manageForm.status === "suspended";
    const payload = {
      role: manageForm.role,
      suspended,
      suspended_at: suspended ? new Date().toISOString() : null,
      suspension_reason: suspended ? manageForm.reason.trim() || null : null,
    };

    const { error } = await supabase.from("profiles").update(payload).eq("id", manageUser.id);
    setSavingUserId(null);

    if (error) {
      setUsersStatus({ type: "error", message: `Could not save user changes: ${error.message}` });
      return;
    }

    setUsersStatus({ type: "success", message: "User updated." });
    await loadUsers();
    closeManageUser();
  };

  const updateCommunity = (key: keyof typeof communityForm, value: string) => {
    setCommunityForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetCommunityForm = () => {
    setCommunityForm({
      title: "",
      blurb: "",
      href: "",
      date: "",
      image: "",
    });
  };

  const openCreateArticleForm = () => {
    resetCommunityForm();
    setCommunityStatus({ type: "idle" });
    setShowCreateArticleForm(true);
  };

  const closeCreateArticleForm = () => {
    resetCommunityForm();
    setCommunityStatus({ type: "idle" });
    setShowCreateArticleForm(false);
  };

  const updateCommunityEdit = (key: keyof typeof communityEditForm, value: string) => {
    setCommunityEditForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateCommunityContent = (key: keyof typeof communityContentForm, value: string) => {
    setCommunityContentForm((prev) => ({ ...prev, [key]: value }));
  };

  const openCommunityContentForm = () => {
    setCommunityContentStatus({ type: "idle" });
    setShowCommunityContentForm(true);
  };

  const closeCommunityContentForm = () => {
    setCommunityContentStatus({ type: "idle" });
    void loadCommunityContent();
    setShowCommunityContentForm(false);
  };

  const getAccessToken = async () => {
    if (!supabase) return null;
    const { data: sessionData } = await supabase.auth.getSession();
    return sessionData.session?.access_token ?? null;
  };

  const handleCreateCommunityArticle = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      setCommunityStatus({ type: "error", message: "Supabase is not configured." });
      return;
    }
    if (!communityForm.title.trim() || !communityForm.blurb.trim() || !communityForm.href.trim()) {
      setCommunityStatus({ type: "error", message: "Title, blurb, and article link are required." });
      return;
    }

    setCommunityStatus({ type: "loading" });
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setCommunityStatus({ type: "error", message: "Sign in again to continue." });
      return;
    }

    const payload = {
      title: communityForm.title.trim(),
      blurb: communityForm.blurb.trim(),
      href: communityForm.href.trim(),
      date: communityForm.date.trim(),
      image: communityForm.image.trim(),
    };

    try {
      const response = await fetch("/api/admin/community-articles", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) {
        setCommunityStatus({ type: "error", message: json?.error ?? "Could not save article." });
        return;
      }
      setCommunityStatus({ type: "success", message: "Community article added." });
      resetCommunityForm();
      setShowCreateArticleForm(false);
      setCommunityArticles((json?.articles ?? []) as CommunityArticle[]);
    } catch {
      setCommunityStatus({ type: "error", message: "Could not save article." });
    }
  };

  const autoFillArticleFields = async (href: string) => {
    if (!supabase) return null;
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setCommunityStatus({ type: "error", message: "Sign in again to continue." });
      return null;
    }

    const response = await fetch("/api/admin/community-article-preview", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ href }),
    });
    const json = await response.json();
    if (!response.ok) {
      setCommunityStatus({ type: "error", message: json?.error ?? "Could not auto-fill from URL." });
      return null;
    }
    return json as { title?: string; blurb?: string; image?: string };
  };

  const handleAutoFillCreateArticle = async () => {
    const href = communityForm.href.trim();
    if (!href) {
      setCommunityStatus({ type: "error", message: "Add an article link first." });
      return;
    }
    setAutoFillingCreateArticle(true);
    const preview = await autoFillArticleFields(href);
    setAutoFillingCreateArticle(false);
    if (!preview) return;

    setCommunityForm((prev) => ({
      ...prev,
      title: preview.title?.trim() || prev.title,
      blurb: preview.blurb?.trim() || prev.blurb,
      image: preview.image?.trim() || prev.image,
    }));
    if (!preview.title && !preview.blurb && !preview.image) {
      setCommunityStatus({ type: "error", message: "No metadata found for this link. Fill fields manually." });
      return;
    }
    setCommunityStatus({ type: "success", message: "Auto-filled article details from URL." });
  };

  const startEditingCommunityArticle = (article: CommunityArticle) => {
    setEditingArticleId(article.id);
    setCommunityEditForm({
      title: article.title ?? "",
      blurb: article.blurb ?? "",
      href: article.href ?? "",
      date: article.date ?? "",
      image: article.image ?? "",
    });
    setCommunityStatus({ type: "idle" });
  };

  const cancelEditingCommunityArticle = () => {
    setEditingArticleId(null);
  };

  const handleSaveCommunityArticle = async (id: string) => {
    if (!supabase) return;
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setCommunityStatus({ type: "error", message: "Sign in again to continue." });
      return;
    }

    if (!communityEditForm.title.trim() || !communityEditForm.blurb.trim() || !communityEditForm.href.trim()) {
      setCommunityStatus({ type: "error", message: "Title, blurb, and article link are required." });
      return;
    }

    setCommunityStatus({ type: "loading" });
    const payload = {
      id,
      title: communityEditForm.title.trim(),
      blurb: communityEditForm.blurb.trim(),
      href: communityEditForm.href.trim(),
      date: communityEditForm.date.trim(),
      image: communityEditForm.image.trim(),
    };

    try {
      const response = await fetch("/api/admin/community-articles", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) {
        setCommunityStatus({ type: "error", message: json?.error ?? "Could not update article." });
        return;
      }
      setCommunityStatus({ type: "success", message: "Article updated." });
      setCommunityArticles((json?.articles ?? []) as CommunityArticle[]);
      setEditingArticleId(null);
    } catch {
      setCommunityStatus({ type: "error", message: "Could not update article." });
    }
  };

  const handleAutoFillEditArticle = async (id: string) => {
    const href = communityEditForm.href.trim();
    if (!href) {
      setCommunityStatus({ type: "error", message: "Add an article link first." });
      return;
    }
    setAutoFillingEditArticleId(id);
    const preview = await autoFillArticleFields(href);
    setAutoFillingEditArticleId(null);
    if (!preview) return;

    setCommunityEditForm((prev) => ({
      ...prev,
      title: preview.title?.trim() || prev.title,
      blurb: preview.blurb?.trim() || prev.blurb,
      image: preview.image?.trim() || prev.image,
    }));
    if (!preview.title && !preview.blurb && !preview.image) {
      setCommunityStatus({ type: "error", message: "No metadata found for this link. Fill fields manually." });
      return;
    }
    setCommunityStatus({ type: "success", message: "Auto-filled article details from URL." });
  };

  const handleDeleteCommunityArticle = async (article: CommunityArticle) => {
    if (!supabase) return;
    const confirmed = window.confirm(`Delete article "${article.title}"?`);
    if (!confirmed) return;

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setCommunityStatus({ type: "error", message: "Sign in again to continue." });
      return;
    }

    setCommunityStatus({ type: "loading" });
    try {
      const response = await fetch("/api/admin/community-articles", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id: article.id }),
      });
      const json = await response.json();
      if (!response.ok) {
        setCommunityStatus({ type: "error", message: json?.error ?? "Could not delete article." });
        return;
      }
      setCommunityStatus({ type: "success", message: "Article deleted." });
      setCommunityArticles((json?.articles ?? []) as CommunityArticle[]);
      if (editingArticleId === article.id) {
        setEditingArticleId(null);
      }
    } catch {
      setCommunityStatus({ type: "error", message: "Could not delete article." });
    }
  };

  const handleSaveCommunityContent = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setCommunityContentStatus({ type: "error", message: "Sign in again to continue." });
      return;
    }

    const boardTitle = communityContentForm.boardTitle.trim();
    const body = communityContentForm.body.trim();
    const paragraphs = body ? [body] : [];

    if (!boardTitle || paragraphs.length === 0) {
      setCommunityContentStatus({ type: "error", message: "Board title and at least one paragraph are required." });
      return;
    }

    setCommunityContentStatus({ type: "loading" });
    try {
      const response = await fetch("/api/admin/community-content", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ boardTitle, paragraphs }),
      });
      const json = await response.json();
      if (!response.ok) {
        setCommunityContentStatus({ type: "error", message: json?.error ?? "Could not update intro block." });
        return;
      }
      setCommunityContentStatus({ type: "success", message: "Community intro block updated." });
      setShowCommunityContentForm(false);
    } catch {
      setCommunityContentStatus({ type: "error", message: "Could not update intro block." });
    }
  };

  const formatMessageDate = (value?: string | null) => {
    if (!value) return "Unknown date";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  const registrationSummary = Object.values(
    registrations.reduce<Record<string, { event_id: string; event_title: string; count: number; signup_mode: SignupMode }>>((acc, row) => {
      const key = row.event_id;
      if (!acc[key]) {
        acc[key] = {
          event_id: row.event_id,
          event_title: row.event_title || "Unknown event",
          count: 0,
          signup_mode: row.signup_mode,
        };
      }
      acc[key].count += 1;
      return acc;
    }, {})
  ).sort((a, b) => b.count - a.count);
  const waitlistRegistrationSummary = registrationSummary.filter((item) => item.signup_mode === "waitlist");
  const directRegistrationSummary = registrationSummary.filter((item) => item.signup_mode !== "waitlist");
  const selectedRegistrationRows = selectedRegistrationEventId
    ? registrations.filter((row) => row.event_id === selectedRegistrationEventId)
    : [];
  const selectedRegistrationEvent =
    registrationSummary.find((item) => item.event_id === selectedRegistrationEventId) ?? null;
  const filteredRegistrations = registrations.filter((row) => {
    if (registrationsEventFilter !== "all" && row.event_id !== registrationsEventFilter) return false;
    const term = registrationsUserFilter.trim().toLowerCase();
    if (!term) return true;
    return (
      row.user_name.toLowerCase().includes(term) ||
      row.user_email.toLowerCase().includes(term) ||
      row.user_id.toLowerCase().includes(term)
    );
  });
  const selectedRegistrationSubmission =
    registrations.find((row) => row.id === selectedRegistrationSubmissionId) ?? null;

  const filteredUsers = users.filter((user) => {
    const term = usersSearch.trim().toLowerCase();
    if (!term) return true;
    return (
      user.name.toLowerCase().includes(term) ||
      user.id.toLowerCase().includes(term) ||
      (user.role ?? "player").toLowerCase().includes(term)
    );
  });
  const flyerByEventId = new Map(
    flyers.filter((flyer) => flyer.event_id).map((flyer) => [flyer.event_id as string, flyer])
  );
  const renderSportFormFields = (
    state: SportFormState,
    target: "create" | "edit",
    sportId?: string
  ) => {
    const updateField = target === "create" ? updateSport : updateEditSport;
    const isUploading = target === "create" ? uploadingCreateSportImage : uploadingEditSportImageId === sportId;

    return (
      <>
        <div className="register-form-grid">
          <div className="form-control">
            <label htmlFor={`${target}-sport-title`}>Sport Title *</label>
            <input
              id={`${target}-sport-title`}
              value={state.title}
              onChange={(e) => updateField("title", e.target.value)}
              required
            />
          </div>
          <div className="form-control">
            <label htmlFor={`${target}-sport-players`}>Players per team</label>
            <input
              id={`${target}-sport-players`}
              type="number"
              min="1"
              value={state.players_per_team}
              onChange={(e) => updateField("players_per_team", e.target.value)}
            />
          </div>
          <div className="form-control">
            <label htmlFor={`${target}-sport-gender`}>Gender</label>
            <select
              id={`${target}-sport-gender`}
              value={state.gender}
              onChange={(e) => updateField("gender", e.target.value as SportGender)}
            >
              {SPORT_GENDER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="form-control">
            <label htmlFor={`${target}-sport-image`}>Image URL</label>
            <input
              id={`${target}-sport-image`}
              value={state.image_url}
              onChange={(e) => updateField("image_url", e.target.value)}
            />
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <label className="button ghost" htmlFor={`${target}-sport-image-upload`} style={{ padding: "0.45rem 0.75rem" }}>
                {isUploading ? "Uploading..." : "Upload an image manually"}
              </label>
              <input
                id={`${target}-sport-image-upload`}
                type="file"
                accept="image/*"
                onChange={(e) =>
                  target === "create"
                    ? void handleCreateSportImageUpload(e)
                    : sportId
                      ? void handleEditSportImageUpload(sportId, e)
                      : undefined
                }
                disabled={Boolean(isUploading)}
                style={{ display: "none" }}
              />
            </div>
          </div>
        </div>
        <div className="form-control">
          <label htmlFor={`${target}-sport-description`}>Short Description</label>
          <textarea
            id={`${target}-sport-description`}
            value={state.short_description}
            onChange={(e) => updateField("short_description", e.target.value)}
            rows={4}
            placeholder="Leagues, clinics, and special events."
          />
        </div>
        <div className="form-control">
          <label htmlFor={`${target}-sport-sections`}>Section Headers</label>
          <textarea
            id={`${target}-sport-sections`}
            value={state.section_headers}
            onChange={(e) => updateField("section_headers", e.target.value)}
            rows={5}
            placeholder={"Leagues\nTournaments\nEvents"}
          />
          <p className="form-help muted">
            One section per line. The page URL is auto-built from the title, and events are grouped by registration slug prefixes like `{slugifySportValue(state.title) || "sport"}-league`.
          </p>
        </div>
      </>
    );
  };

  const filteredContactMessages = contactMessages.filter((message) => {
    const isRead = Boolean(message.is_read);
    if (contactFilter === "read" && !isRead) return false;
    if (contactFilter === "unread" && isRead) return false;

    const query = contactSearch.trim().toLowerCase();
    if (!query) return true;

    return [message.name, message.email, message.message]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query));
  });

  const unreadContactCount = contactMessages.filter((message) => !message.is_read).length;

  return (
    <div className="account-page">
      <AccessibilityControls />
      <div className="account-body shell">
        <HistoryBackButton label="← Back" fallbackHref="/" />
        {status === "loading" ? <p className="muted">Loading admin dashboard...</p> : null}
        {status === "no-session" ? (
          <p className="muted">
            Sign in to access the admin dashboard. <Link href="/account">Go to account</Link>.
          </p>
        ) : null}
        {status === "forbidden" ? (
          <p className="muted">
            You do not have access to this page.
          </p>
        ) : null}
        {status === "allowed" ? (
          <>
            <section className="account-card">
              <h1>Admin Dashboard</h1>
              <p className="muted">Choose an area to manage.</p>
              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                  maxWidth: 980,
                }}
              >
                {adminModules.map((module) => (
                  <button
                    key={module.id}
                    className={`button ${activeModule === module.id ? "primary" : "ghost"}`}
                    type="button"
                    onClick={() => openModule(module.id, module.enabled)}
                    disabled={!module.enabled}
                    style={{
                      textAlign: "left",
                      height: "100%",
                      minHeight: 150,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: 8,
                      opacity: module.enabled ? 1 : 0.7,
                    }}
                  >
                    <span style={{ fontSize: "1rem", fontWeight: 700 }}>{module.title}</span>
                    <span style={{ fontSize: "0.9rem", lineHeight: 1.35 }}>{module.description}</span>
                    {!module.enabled ? <span style={{ fontSize: "0.8rem" }}>Coming soon</span> : null}
                  </button>
                ))}
              </div>
            </section>

            {activeModule === "events" ? (
              <>
            <section className="account-card">
              <h2>Events Manager</h2>
              <p className="muted">Add new events or update/remove existing ones.</p>
            </section>
            <section className="account-card">
              <div className="account-card__header">
                <div>
                  <h2>Create Event</h2>
                  <p className="muted">Open the event builder when you want to add a new event.</p>
                </div>
                {!showCreateEventForm ? (
                  <button className="button primary" type="button" onClick={openCreateEventForm}>
                    Create Event
                  </button>
                ) : null}
              </div>
              {showCreateEventForm ? (
                <form className="register-form" onSubmit={handleCreateEvent}>
                  <div className="register-form-grid">
                    <div className="form-control">
                      <label htmlFor="event-title">Title *</label>
                      <input
                        id="event-title"
                        value={form.title}
                        onChange={(e) => update("title", e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-control">
                      <label htmlFor="event-start">Start date</label>
                      <input
                        id="event-start"
                        type="date"
                        value={form.start_date}
                        onChange={(e) => update("start_date", e.target.value)}
                      />
                    </div>
                    <div className="form-control">
                      <label htmlFor="event-end">End date</label>
                      <input
                        id="event-end"
                        type="date"
                        value={form.end_date}
                        onChange={(e) => update("end_date", e.target.value)}
                      />
                    </div>
                    <div className="form-control">
                      <label htmlFor="event-time">Time info</label>
                      <input
                        id="event-time"
                        value={form.time_info}
                        onChange={(e) => update("time_info", e.target.value)}
                        placeholder="8:00 AM tip-off"
                      />
                    </div>
                    <div className="form-control">
                      <label htmlFor="event-location">Location</label>
                      <input
                        id="event-location"
                        value={form.location}
                        onChange={(e) => update("location", e.target.value)}
                      />
                    </div>
                    <div className="form-control">
                      <label htmlFor="event-host-type">Host type</label>
                      <select
                        id="event-host-type"
                        value={form.host_type}
                        onChange={(e) => update("host_type", e.target.value as HostType)}
                      >
                        <option value="aldrich">Aldrich</option>
                        <option value="featured">Featured</option>
                        <option value="partner">Partner</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="form-control">
                      <label htmlFor="event-image">Image URL</label>
                      <input
                        id="event-image"
                        value={form.image_url ?? ""}
                        onChange={(e) => update("image_url", e.target.value)}
                      />
                      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <label className="button ghost" htmlFor="event-image-upload" style={{ padding: "0.45rem 0.75rem" }}>
                          {uploadingCreateImage ? "Uploading..." : "Upload an image manually"}
                        </label>
                        <input
                          id="event-image-upload"
                          type="file"
                          accept="image/*"
                          onChange={handleCreateImageUpload}
                          disabled={uploadingCreateImage}
                          style={{ display: "none" }}
                        />
                      </div>
                    </div>
                    <div className="form-control">
                      <label htmlFor="event-signup-mode">Signup mode</label>
                      <select
                        id="event-signup-mode"
                        value={form.signup_mode}
                        onChange={(e) => update("signup_mode", e.target.value as SignupMode)}
                      >
                        <option value="registration">Registration</option>
                        <option value="waitlist">Waitlist / interest</option>
                      </select>
                    </div>
                    <div className="form-control">
                      <label htmlFor="event-program-slug">Registration program slug</label>
                      <input
                        id="event-program-slug"
                        value={form.registration_program_slug}
                        onChange={(e) => update("registration_program_slug", e.target.value)}
                      />
                    </div>
                    <div className="form-control">
                      <label htmlFor="event-waiver-url">Waiver URL</label>
                      <input
                        id="event-waiver-url"
                        value={form.waiver_url}
                        onChange={(e) => update("waiver_url", e.target.value)}
                        disabled={form.signup_mode === "waitlist"}
                      />
                    </div>
                    <div className="form-control">
                      <label htmlFor="event-registration-limit">Registration limit</label>
                      <input
                        id="event-registration-limit"
                        type="number"
                        min="1"
                        value={form.registration_limit}
                        onChange={(e) => update("registration_limit", e.target.value)}
                        disabled={form.signup_mode === "waitlist"}
                      />
                    </div>
                  </div>
                  <div className="form-control checkbox-control" style={{ justifySelf: "start", textAlign: "left", width: "fit-content" }}>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.registration_enabled}
                        onChange={(e) => update("registration_enabled", e.target.checked)}
                      />
                      <span>Accept signups</span>
                    </label>
                  </div>
                  {form.signup_mode === "waitlist" ? (
                    <p className="muted">Waitlist events only collect name, email, and phone. Custom fields, waivers, and limits are disabled.</p>
                  ) : (
                    renderRegistrationBuilder("create", form)
                  )}
                  <div className="cta-row">
                    <button className="button primary" type="submit" disabled={formStatus.type === "loading"}>
                      {formStatus.type === "loading" ? "Saving..." : "Create Event"}
                    </button>
                    <button className="button ghost" type="button" onClick={closeCreateEventForm}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
              {formStatus.message ? (
                <p className={`form-help ${formStatus.type === "error" ? "error" : "muted"}`}>{formStatus.message}</p>
              ) : null}
            </section>

            <section className="account-card">
              <div className="account-card__header">
                <div>
                  <h2>Existing Events</h2>
                  <p className="muted">Delete outdated or incorrect events.</p>
                </div>
                <button className="button ghost" type="button" onClick={() => void loadEvents()} disabled={loadingEvents}>
                  {loadingEvents ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              {loadingEvents ? <p className="muted">Loading events...</p> : null}
              {eventsError ? <p className="form-help error">{eventsError}</p> : null}
              {!loadingEvents && events.length === 0 ? <p className="muted">No events found.</p> : null}
              {!loadingEvents && events.length > 0 ? (
                <div className="event-list admin-existing-events-list">
                  {events.map((event) => (
                    <article key={event.id} className="event-card-simple">
                      <div className="event-card__header">
                        <h3>{event.title}</h3>
                      </div>
                      <div className="event-card__meta">
                        <p className="muted">Date: {dateLabel(event.start_date, event.end_date)}</p>
                        {event.location ? <p className="muted">Location: {event.location}</p> : null}
                        {event.registration_program_slug ? (
                          <p className="muted">Program: {event.registration_program_slug}</p>
                        ) : null}
                        <p className="muted">
                          Signup mode: {event.signup_mode === "waitlist" ? "Waitlist / interest" : "Registration"}
                        </p>
                        <p className="muted">
                          Signup status: {event.registration_enabled ? "Open" : "Closed"}
                        </p>
                      </div>
                      <div className="cta-row">
                        <button
                          className="button ghost"
                          type="button"
                          onClick={() => startEditing(event)}
                          disabled={editingId === event.id && savingEditId === event.id}
                        >
                          {editingId === event.id ? "Editing" : "Edit"}
                        </button>
                        <button
                          className="button ghost"
                          type="button"
                          onClick={() => void handleDeleteEvent(event.id, event.title)}
                          disabled={deletingId === event.id}
                        >
                          {deletingId === event.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                      {editingId === event.id ? (
                        <div className="register-form" style={{ marginTop: 12 }}>
                          <div className="register-form-grid">
                            <div className="form-control">
                              <label htmlFor={`edit-title-${event.id}`}>Title *</label>
                              <input
                                id={`edit-title-${event.id}`}
                                value={editForm.title}
                                onChange={(e) => updateEdit("title", e.target.value)}
                                required
                              />
                            </div>
                            <div className="form-control">
                              <label htmlFor={`edit-start-${event.id}`}>Start date</label>
                              <input
                                id={`edit-start-${event.id}`}
                                type="date"
                                value={editForm.start_date}
                                onChange={(e) => updateEdit("start_date", e.target.value)}
                              />
                            </div>
                            <div className="form-control">
                              <label htmlFor={`edit-end-${event.id}`}>End date</label>
                              <input
                                id={`edit-end-${event.id}`}
                                type="date"
                                value={editForm.end_date}
                                onChange={(e) => updateEdit("end_date", e.target.value)}
                              />
                            </div>
                            <div className="form-control">
                              <label htmlFor={`edit-time-${event.id}`}>Time info</label>
                              <input
                                id={`edit-time-${event.id}`}
                                value={editForm.time_info}
                                onChange={(e) => updateEdit("time_info", e.target.value)}
                              />
                            </div>
                            <div className="form-control">
                              <label htmlFor={`edit-location-${event.id}`}>Location</label>
                              <input
                                id={`edit-location-${event.id}`}
                                value={editForm.location}
                                onChange={(e) => updateEdit("location", e.target.value)}
                              />
                            </div>
                            <div className="form-control">
                              <label htmlFor={`edit-host-${event.id}`}>Host type</label>
                              <select
                                id={`edit-host-${event.id}`}
                                value={editForm.host_type}
                                onChange={(e) => updateEdit("host_type", e.target.value as HostType)}
                              >
                                <option value="aldrich">Aldrich</option>
                                <option value="featured">Featured</option>
                                <option value="partner">Partner</option>
                                <option value="other">Other</option>
                              </select>
                            </div>
                            <div className="form-control">
                              <label htmlFor={`edit-image-${event.id}`}>Image URL</label>
                              <input
                                id={`edit-image-${event.id}`}
                                value={editForm.image_url ?? ""}
                                onChange={(e) => updateEdit("image_url", e.target.value)}
                              />
                              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                <label
                                  className="button ghost"
                                  htmlFor={`edit-image-upload-${event.id}`}
                                  style={{ padding: "0.45rem 0.75rem" }}
                                >
                                  {uploadingEditImageId === event.id ? "Uploading..." : "Upload an image manually"}
                                </label>
                                <input
                                  id={`edit-image-upload-${event.id}`}
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => void handleEditImageUpload(event.id, e)}
                                  disabled={uploadingEditImageId === event.id}
                                  style={{ display: "none" }}
                                />
                              </div>
                            </div>
                            <div className="form-control">
                              <label htmlFor={`edit-signup-mode-${event.id}`}>Signup mode</label>
                              <select
                                id={`edit-signup-mode-${event.id}`}
                                value={editForm.signup_mode}
                                onChange={(e) => updateEdit("signup_mode", e.target.value as SignupMode)}
                              >
                                <option value="registration">Registration</option>
                                <option value="waitlist">Waitlist / interest</option>
                              </select>
                            </div>
                            <div className="form-control">
                              <label htmlFor={`edit-slug-${event.id}`}>Registration program slug</label>
                              <input
                                id={`edit-slug-${event.id}`}
                                value={editForm.registration_program_slug}
                                onChange={(e) => updateEdit("registration_program_slug", e.target.value)}
                              />
                            </div>
                            <div className="form-control">
                              <label htmlFor={`edit-waiver-url-${event.id}`}>Waiver URL</label>
                              <input
                                id={`edit-waiver-url-${event.id}`}
                                value={editForm.waiver_url}
                                onChange={(e) => updateEdit("waiver_url", e.target.value)}
                                disabled={editForm.signup_mode === "waitlist"}
                              />
                            </div>
                            <div className="form-control">
                              <label htmlFor={`edit-registration-limit-${event.id}`}>Registration limit</label>
                              <input
                                id={`edit-registration-limit-${event.id}`}
                                type="number"
                                min="1"
                                value={editForm.registration_limit}
                                onChange={(e) => updateEdit("registration_limit", e.target.value)}
                                disabled={editForm.signup_mode === "waitlist"}
                              />
                            </div>
                          </div>
                          <div className="form-control checkbox-control" style={{ justifySelf: "start", textAlign: "left", width: "fit-content" }}>
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={editForm.registration_enabled}
                                onChange={(e) => updateEdit("registration_enabled", e.target.checked)}
                              />
                              <span>Accept signups</span>
                            </label>
                          </div>
                          {editForm.signup_mode === "waitlist" ? (
                            <p className="muted">Waitlist events only collect name, email, and phone. Custom fields, waivers, and limits are disabled.</p>
                          ) : (
                            renderRegistrationBuilder("edit", editForm)
                          )}
                          <div className="cta-row">
                            <button
                              className="button primary"
                              type="button"
                              onClick={() => void handleSaveEdit(event.id)}
                              disabled={savingEditId === event.id}
                            >
                              {savingEditId === event.id ? "Saving..." : "Save"}
                            </button>
                            <button className="button ghost" type="button" onClick={cancelEditing}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
              </>
            ) : null}
            {activeModule === "sports" ? (
              <>
                <section className="account-card">
                  <h2>Sports Manager</h2>
                  <p className="muted">Create sport pages and control which section headers appear on each one.</p>
                </section>
                <section className="account-card">
                  <div className="account-card__header">
                    <div>
                      <h2>Create Sport</h2>
                      <p className="muted">Open the sport builder when you want to add a new sport page.</p>
                    </div>
                    {!showCreateSportForm ? (
                      <button className="button primary" type="button" onClick={openCreateSportForm}>
                        Create Sport
                      </button>
                    ) : null}
                  </div>
                  {showCreateSportForm ? (
                    <form className="register-form" onSubmit={handleCreateSport}>
                      {renderSportFormFields(sportForm, "create")}
                      <div className="cta-row">
                        <button className="button primary" type="submit" disabled={sportsStatus.type === "loading"}>
                          {sportsStatus.type === "loading" ? "Saving..." : "Create Sport"}
                        </button>
                        <button className="button ghost" type="button" onClick={closeCreateSportForm}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {sportsStatus.message ? (
                    <p className={`form-help ${sportsStatus.type === "error" ? "error" : "muted"}`}>{sportsStatus.message}</p>
                  ) : null}
                </section>

                <section className="account-card">
                  <div className="account-card__header">
                    <div>
                      <h2>Existing Sports</h2>
                      <p className="muted">Edit the sport page metadata and section configuration.</p>
                    </div>
                    <button className="button ghost" type="button" onClick={() => void loadSports()} disabled={loadingSports}>
                      {loadingSports ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                  {loadingSports ? <p className="muted">Loading sports...</p> : null}
                  {sportsError ? <p className="form-help error">{sportsError}</p> : null}
                  {!loadingSports && sports.length === 0 ? <p className="muted">No sports found.</p> : null}
                  {!loadingSports && sports.length > 0 ? (
                    <div className="event-list admin-scroll-panel">
                      {sports.map((sport) => (
                        <article key={sport.id} className="event-card-simple">
                          <div className="event-card__header">
                            <h3>{sport.title}</h3>
                          </div>
                          <div className="event-card__meta">
                            <p className="muted">Page: /sports/{slugifySportValue(sport.title)}</p>
                            {sport.players_per_team ? <p className="muted">Players per team: {sport.players_per_team}</p> : null}
                            {sport.gender ? <p className="muted">Gender: {sport.gender}</p> : null}
                            {parseSportSectionHeaders(sport.section_headers).length > 0 ? (
                              <p className="muted">Sections: {parseSportSectionHeaders(sport.section_headers).join(", ")}</p>
                            ) : null}
                          </div>
                          {sport.short_description ? <p className="muted">{sport.short_description}</p> : null}
                          <div className="cta-row">
                            <button
                              className="button ghost"
                              type="button"
                              onClick={() => startEditingSport(sport)}
                              disabled={editingSportId === sport.id && savingSportEditId === sport.id}
                            >
                              {editingSportId === sport.id ? "Editing" : "Edit"}
                            </button>
                            <button
                              className="button ghost"
                              type="button"
                              onClick={() => void handleDeleteSport(sport.id, sport.title)}
                              disabled={deletingSportId === sport.id}
                            >
                              {deletingSportId === sport.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                          {editingSportId === sport.id ? (
                            <div className="register-form" style={{ marginTop: 12 }}>
                              {renderSportFormFields(editSportForm, "edit", sport.id)}
                              <div className="cta-row">
                                <button
                                  className="button primary"
                                  type="button"
                                  onClick={() => void handleSaveSportEdit(sport.id)}
                                  disabled={savingSportEditId === sport.id}
                                >
                                  {savingSportEditId === sport.id ? "Saving..." : "Save"}
                                </button>
                                <button className="button ghost" type="button" onClick={cancelEditingSport}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}
            {activeModule === "community" ? (
              <>
                <section className="account-card">
                  <h2>Community Articles</h2>
                  <p className="muted">Add featured articles shown on the Community page.</p>
                </section>
                <section className="account-card">
                  <div className="account-card__header">
                    <div>
                      <h2>Top Community Block</h2>
                      <p className="muted">Edit the title and intro paragraphs shown at the top of the Community page.</p>
                    </div>
                    {!showCommunityContentForm ? (
                      <button className="button primary" type="button" onClick={openCommunityContentForm}>
                        Edit
                      </button>
                    ) : null}
                  </div>
                  {showCommunityContentForm ? (
                    <form className="register-form" onSubmit={handleSaveCommunityContent}>
                      <div className="form-control">
                        <label htmlFor="community-board-title">Block Title *</label>
                        <input
                          id="community-board-title"
                          value={communityContentForm.boardTitle}
                          onChange={(e) => updateCommunityContent("boardTitle", e.target.value)}
                          required
                        />
                      </div>
                      <div className="register-form-grid">
                        <div className="form-control">
                          <label htmlFor="community-paragraph-body">Paragraph Body *</label>
                          <textarea
                            id="community-paragraph-body"
                            value={communityContentForm.body}
                            onChange={(e) => updateCommunityContent("body", e.target.value)}
                            rows={12}
                            required
                          />
                        </div>
                      </div>
                      <p className="form-help muted">
                        Add spacing manually with blank lines (press Enter twice).
                      </p>
                      <div className="cta-row">
                        <button className="button primary" type="submit" disabled={communityContentStatus.type === "loading"}>
                          {communityContentStatus.type === "loading" ? "Saving..." : "Save Top Block"}
                        </button>
                        <button className="button ghost" type="button" onClick={closeCommunityContentForm}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {communityContentStatus.message ? (
                    <p className={`form-help ${communityContentStatus.type === "error" ? "error" : "muted"}`}>
                      {communityContentStatus.message}
                    </p>
                  ) : null}
                </section>
                <section className="account-card">
                  <div className="account-card__header">
                    <div>
                      <h2>Add Article</h2>
                      <p className="muted">Open the article builder when you want to add a new article.</p>
                    </div>
                    {!showCreateArticleForm ? (
                      <button className="button primary" type="button" onClick={openCreateArticleForm}>
                        Add Article
                      </button>
                    ) : null}
                  </div>
                  {showCreateArticleForm ? (
                    <form className="register-form" onSubmit={handleCreateCommunityArticle}>
                      <div className="register-form-grid">
                        <div className="form-control">
                          <label htmlFor="community-title">Title *</label>
                          <input
                            id="community-title"
                            value={communityForm.title}
                            onChange={(e) => updateCommunity("title", e.target.value)}
                            required
                          />
                        </div>
                        <div className="form-control">
                          <label htmlFor="community-link">Article Link *</label>
                          <input
                            id="community-link"
                            value={communityForm.href}
                            onChange={(e) => updateCommunity("href", e.target.value)}
                            required
                          />
                          <button
                            className="button ghost"
                            type="button"
                            onClick={() => void handleAutoFillCreateArticle()}
                            disabled={autoFillingCreateArticle}
                            style={{ marginTop: 8, alignSelf: "flex-start" }}
                          >
                            {autoFillingCreateArticle ? "Auto-filling..." : "Auto-fill from URL"}
                          </button>
                        </div>
                        <div className="form-control">
                          <label htmlFor="community-date">Date label</label>
                          <input
                            id="community-date"
                            value={communityForm.date}
                            onChange={(e) => updateCommunity("date", e.target.value)}
                            placeholder="Aug 5, 2024"
                          />
                        </div>
                        <div className="form-control">
                          <label htmlFor="community-image">Image URL</label>
                          <input
                            id="community-image"
                            value={communityForm.image}
                            onChange={(e) => updateCommunity("image", e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="form-control">
                        <label htmlFor="community-blurb">Blurb *</label>
                        <textarea
                          id="community-blurb"
                          value={communityForm.blurb}
                          onChange={(e) => updateCommunity("blurb", e.target.value)}
                          rows={4}
                          required
                        />
                      </div>
                      <div className="cta-row">
                        <button className="button primary" type="submit" disabled={communityStatus.type === "loading"}>
                          {communityStatus.type === "loading" ? "Saving..." : "Add Article"}
                        </button>
                        <button className="button ghost" type="button" onClick={closeCreateArticleForm}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {communityStatus.message ? (
                    <p className={`form-help ${communityStatus.type === "error" ? "error" : "muted"}`}>
                      {communityStatus.message}
                    </p>
                  ) : null}
                </section>
                <section className="account-card">
                  <div className="account-card__header">
                    <div>
                      <h2>Current Articles</h2>
                      <p className="muted">These are loaded from the local articles source file.</p>
                    </div>
                    <button className="button ghost" type="button" onClick={() => void loadCommunityArticles()} disabled={loadingCommunity}>
                      {loadingCommunity ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                  {loadingCommunity ? <p className="muted">Loading articles...</p> : null}
                  {!loadingCommunity && communityArticles.length === 0 ? (
                    <p className="muted">No articles found.</p>
                  ) : null}
                  {!loadingCommunity && communityArticles.length > 0 ? (
                    <div className="event-list admin-scroll-panel">
                      {communityArticles.map((article) => (
                        <article key={article.id} className="event-card-simple">
                          <div className="event-card__header">
                            <h3>{article.title}</h3>
                          </div>
                          <div className="event-card__meta">
                            {article.date ? <p className="muted">Date: {article.date}</p> : null}
                            <p className="muted">Link: {article.href}</p>
                          </div>
                          <p className="muted">{article.blurb}</p>
                          <div className="cta-row">
                            <button className="button ghost" type="button" onClick={() => startEditingCommunityArticle(article)}>
                              {editingArticleId === article.id ? "Editing" : "Edit"}
                            </button>
                            <button
                              className="button ghost"
                              type="button"
                              onClick={() => void handleDeleteCommunityArticle(article)}
                            >
                              Delete
                            </button>
                          </div>
                          {editingArticleId === article.id ? (
                            <div className="register-form" style={{ marginTop: 12 }}>
                              <div className="register-form-grid">
                                <div className="form-control">
                                  <label htmlFor={`edit-community-title-${article.id}`}>Title *</label>
                                  <input
                                    id={`edit-community-title-${article.id}`}
                                    value={communityEditForm.title}
                                    onChange={(e) => updateCommunityEdit("title", e.target.value)}
                                    required
                                  />
                                </div>
                                <div className="form-control">
                                  <label htmlFor={`edit-community-link-${article.id}`}>Article Link *</label>
                                  <input
                                    id={`edit-community-link-${article.id}`}
                                    value={communityEditForm.href}
                                    onChange={(e) => updateCommunityEdit("href", e.target.value)}
                                    required
                                  />
                                  <button
                                    className="button ghost"
                                    type="button"
                                    onClick={() => void handleAutoFillEditArticle(article.id)}
                                    disabled={autoFillingEditArticleId === article.id}
                                    style={{ marginTop: 8, alignSelf: "flex-start" }}
                                  >
                                    {autoFillingEditArticleId === article.id ? "Auto-filling..." : "Auto-fill from URL"}
                                  </button>
                                </div>
                                <div className="form-control">
                                  <label htmlFor={`edit-community-date-${article.id}`}>Date label</label>
                                  <input
                                    id={`edit-community-date-${article.id}`}
                                    value={communityEditForm.date}
                                    onChange={(e) => updateCommunityEdit("date", e.target.value)}
                                  />
                                </div>
                                <div className="form-control">
                                  <label htmlFor={`edit-community-image-${article.id}`}>Image URL</label>
                                  <input
                                    id={`edit-community-image-${article.id}`}
                                    value={communityEditForm.image}
                                    onChange={(e) => updateCommunityEdit("image", e.target.value)}
                                  />
                                </div>
                              </div>
                              <div className="form-control">
                                <label htmlFor={`edit-community-blurb-${article.id}`}>Blurb *</label>
                                <textarea
                                  id={`edit-community-blurb-${article.id}`}
                                  value={communityEditForm.blurb}
                                  onChange={(e) => updateCommunityEdit("blurb", e.target.value)}
                                  rows={3}
                                  required
                                />
                              </div>
                              <div className="cta-row">
                                <button
                                  className="button primary"
                                  type="button"
                                  onClick={() => void handleSaveCommunityArticle(article.id)}
                                  disabled={communityStatus.type === "loading"}
                                >
                                  {communityStatus.type === "loading" ? "Saving..." : "Save"}
                                </button>
                                <button className="button ghost" type="button" onClick={cancelEditingCommunityArticle}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}
            {activeModule === "registrations" ? (
              <>
                <section className="account-card">
                  <h2>Event Registrations</h2>
                  <p className="muted">See who signed up for which event, including waitlist-only events.</p>
                </section>
                <section className="account-card">
                  <div className="account-card__header">
                    <div>
                      <h2>Registration Summary</h2>
                      <p className="muted">Count of signups by event, grouped by signup mode.</p>
                    </div>
                    <button
                      className="button ghost"
                      type="button"
                      onClick={() => void loadRegistrations()}
                      disabled={loadingRegistrations}
                    >
                      {loadingRegistrations ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                  {registrationsError ? <p className="form-help error">{registrationsError}</p> : null}
                  {loadingRegistrations ? <p className="muted">Loading registrations...</p> : null}
                  {!loadingRegistrations && registrations.length === 0 ? (
                    <p className="muted">No registrations found.</p>
                  ) : null}
                  {!loadingRegistrations && registrations.length > 0 ? (
                    <div style={{ display: "grid", gap: 20 }}>
                      <div>
                        <h3 style={{ marginBottom: 8 }}>Registration Events</h3>
                        {directRegistrationSummary.length === 0 ? (
                          <p className="muted">No registration events have submissions yet.</p>
                        ) : (
                          <ul className="list admin-registration-summary-list" style={{ display: "grid", gap: 8 }}>
                            {directRegistrationSummary.map((item) => (
                              <li key={item.event_id}>
                                <button
                                  className={`team-card admin-registration-summary ${selectedRegistrationEventId === item.event_id ? "is-active" : ""}`}
                                  type="button"
                                  onClick={() => setSelectedRegistrationEventId(item.event_id)}
                                >
                                  <div className="team-card__info">
                                    <p className="list__title">{item.event_title}</p>
                                    <p className="muted">{item.count} signup{item.count === 1 ? "" : "s"}</p>
                                  </div>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <h3 style={{ marginBottom: 8 }}>Waitlisted Events</h3>
                        {waitlistRegistrationSummary.length === 0 ? (
                          <p className="muted">No waitlisted events have submissions yet.</p>
                        ) : (
                          <ul className="list admin-registration-summary-list" style={{ display: "grid", gap: 8 }}>
                            {waitlistRegistrationSummary.map((item) => (
                              <li key={item.event_id}>
                                <button
                                  className={`team-card admin-registration-summary ${selectedRegistrationEventId === item.event_id ? "is-active" : ""}`}
                                  type="button"
                                  onClick={() => setSelectedRegistrationEventId(item.event_id)}
                                >
                                  <div className="team-card__info">
                                    <p className="list__title">{item.event_title}</p>
                                    <p className="muted">Waitlist • {item.count} signup{item.count === 1 ? "" : "s"}</p>
                                  </div>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ) : null}
                </section>
                <section className="account-card">
                  <h2>All Signups</h2>
                  {!loadingRegistrations && registrations.length > 0 ? (
                    <>
                      <div className="admin-signups-toolbar">
                        <div className="form-control admin-signups-toolbar__field">
                          <label htmlFor="registrations-event-filter">Filter by event</label>
                          <select
                            id="registrations-event-filter"
                            value={registrationsEventFilter}
                            onChange={(event) => setRegistrationsEventFilter(event.target.value)}
                          >
                            <option value="all">All events</option>
                            {registrationSummary.map((item) => (
                              <option key={item.event_id} value={item.event_id}>
                                {item.event_title}{item.signup_mode === "waitlist" ? " (Waitlist)" : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-control admin-signups-toolbar__field">
                          <label htmlFor="registrations-user-filter">Filter by user</label>
                          <input
                            id="registrations-user-filter"
                            value={registrationsUserFilter}
                            onChange={(event) => setRegistrationsUserFilter(event.target.value)}
                            placeholder="Name, email, or user ID"
                          />
                        </div>
                      </div>
                      {filteredRegistrations.length === 0 ? (
                        <p className="muted">No signups match the current filters.</p>
                      ) : (
                        <div className="event-list admin-scroll-panel">
                          {filteredRegistrations.map((row) => (
                            <article key={row.id} className="event-card-simple">
                              <div className="event-card__header">
                                <h3>{row.event_title}</h3>
                              </div>
                              <div className="event-card__meta">
                                <p className="muted">Type: {row.signup_mode === "waitlist" ? "Waitlist" : "Registration"}</p>
                                <p className="muted">User: {row.user_name}</p>
                                <p className="muted">Email: {row.user_email}</p>
                                {row.user_phone ? <p className="muted">Phone: {row.user_phone}</p> : null}
                                {row.submitted_at ? (
                                  <p className="muted">Submitted: {formatMessageDate(row.submitted_at)}</p>
                                ) : null}
                              </div>
                              <div className="cta-row">
                                <button
                                  className="button ghost"
                                  type="button"
                                  onClick={() => setSelectedRegistrationSubmissionId(row.id)}
                                >
                                  View Submission
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </>
                  ) : null}
                </section>
                {selectedRegistrationEvent ? (
                  <div
                    className="event-detail-backdrop"
                    role="dialog"
                    aria-modal="true"
                    aria-label={`${selectedRegistrationEvent.event_title} registrations`}
                    onClick={() => setSelectedRegistrationEventId(null)}
                  >
                    <div className="event-detail" onClick={(event) => event.stopPropagation()}>
                      <div className="event-detail__header">
                        <div>
                          <p className="eyebrow">{selectedRegistrationEvent.signup_mode === "waitlist" ? "Waitlist Summary" : "Registration Summary"}</p>
                          <h2>{selectedRegistrationEvent.event_title}</h2>
                          <p className="muted">
                            {selectedRegistrationEvent.count} signup{selectedRegistrationEvent.count === 1 ? "" : "s"} for this {selectedRegistrationEvent.signup_mode === "waitlist" ? "waitlist event" : "event"}.
                          </p>
                        </div>
                        <div className="event-detail__header-actions">
                          <button
                            className="button ghost"
                            type="button"
                            onClick={() => setSelectedRegistrationEventId(null)}
                          >
                            Close
                          </button>
                        </div>
                      </div>
                      <div className="event-list" style={{ marginTop: 16 }}>
                        {selectedRegistrationRows.map((row) => (
                          <article key={row.id} className="event-card-simple">
                            <div className="event-card__header">
                              <h3>{row.user_name}</h3>
                            </div>
                            <div className="event-card__meta">
                              <p className="muted">Type: {row.signup_mode === "waitlist" ? "Waitlist" : "Registration"}</p>
                              <p className="muted">Email: {row.user_email}</p>
                              {row.user_phone ? <p className="muted">Phone: {row.user_phone}</p> : null}
                              <p className="muted">User ID: {row.user_id}</p>
                              {row.submitted_at ? (
                                <p className="muted">Submitted: {formatMessageDate(row.submitted_at)}</p>
                              ) : null}
                            </div>
                            <div className="cta-row">
                              <button
                                className="button ghost"
                                type="button"
                                onClick={() => setSelectedRegistrationSubmissionId(row.id)}
                              >
                                View Submission
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
                <SubmissionReviewModal
                  open={Boolean(selectedRegistrationSubmission)}
                  submission={
                    selectedRegistrationSubmission
                      ? {
                          eventTitle: selectedRegistrationSubmission.event_title,
                          submittedAt: selectedRegistrationSubmission.submitted_at,
                          name: selectedRegistrationSubmission.user_name,
                          email: selectedRegistrationSubmission.user_email,
                          phone: selectedRegistrationSubmission.user_phone,
                          answers: selectedRegistrationSubmission.answers ?? null,
                          attachments: selectedRegistrationSubmission.attachments ?? null,
                          waiverAccepted: selectedRegistrationSubmission.waiver_accepted ?? false,
                        }
                      : null
                  }
                  onClose={() => setSelectedRegistrationSubmissionId(null)}
                />
              </>
            ) : null}
            {activeModule === "users" ? (
              <>
                <section className="account-card">
                  <h2>Users</h2>
                  <p className="muted">Manage user roles and account status.</p>
                </section>
                <section className="account-card">
                  <div className="account-card__header">
                    <div>
                      <h2>User Directory</h2>
                      <p className="muted">Admins and owners only.</p>
                    </div>
                    <button className="button ghost" type="button" onClick={() => void loadUsers()} disabled={loadingUsers}>
                      {loadingUsers ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                  <div className="form-control admin-user-search" style={{ marginTop: 12 }}>
                    <label htmlFor="users-search">Search users</label>
                    <input
                      id="users-search"
                      value={usersSearch}
                      onChange={(e) => setUsersSearch(e.target.value)}
                      placeholder="Name, role, or user ID"
                    />
                  </div>
                  {usersError ? <p className="form-help error">{usersError}</p> : null}
                  {usersStatus.message ? (
                    <p className={`form-help ${usersStatus.type === "error" ? "error" : "muted"}`}>{usersStatus.message}</p>
                  ) : null}
                  {loadingUsers ? <p className="muted">Loading users...</p> : null}
                  {!loadingUsers && filteredUsers.length === 0 ? <p className="muted">No users found.</p> : null}
                  {!loadingUsers && filteredUsers.length > 0 ? (
                    <div className="user-directory admin-user-directory-scroll">
                      <div className="user-directory__header">
                        <span>USER</span>
                        <span>ROLE</span>
                        <span>STATUS</span>
                        <span className="user-directory__actions-header">ACTIONS</span>
                      </div>
                      {filteredUsers.map((user) => {
                        const isSuspended = user.suspended === true;
                        return (
                          <div key={user.id} className="user-directory__row">
                            <div className="user-directory__primary">
                              <p className="list__title">{user.name || "Unnamed user"}</p>
                              <p className="muted">{user.id}</p>
                            </div>
                            <p className="user-directory__cell user-directory__role">
                              <span className="user-directory__label">Role:</span>
                              <span style={{ textTransform: "capitalize" }}>{user.role ?? "player"}</span>
                            </p>
                            <div className="user-directory__cell">
                              <span className="user-directory__label">Status:</span>
                              <span className={`pill ${isSuspended ? "pill--amber" : "pill--green"}`}>
                                {isSuspended ? "Suspended" : "Active"}
                              </span>
                            </div>
                            <div className="user-directory__actions">
                              <span className="user-directory__label">Actions:</span>
                              <button className="button ghost" type="button" onClick={() => openManageUser(user)}>
                                Manage
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
                {manageUser ? (
                  <div
                    className="event-detail-backdrop"
                    role="dialog"
                    aria-modal="true"
                    onClick={(event) => {
                      if (event.target === event.currentTarget) {
                        closeManageUser();
                      }
                    }}
                  >
                    <article className="event-detail" style={{ width: "min(600px, 100%)" }}>
                      <div className="event-detail__header">
                        <div>
                          <h2>Manage {manageUser.name || "User"}</h2>
                        </div>
                        <button className="button ghost" type="button" onClick={closeManageUser}>
                          Close
                        </button>
                      </div>
                      <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
                        <div className="form-control">
                          <label>Status</label>
                          <div className="cta-row">
                            <button
                              type="button"
                              className={`button ${manageForm.status === "active" ? "primary" : "ghost"}`}
                              onClick={() => setManageForm((prev) => ({ ...prev, status: "active" }))}
                            >
                              Activate
                            </button>
                            <button
                              type="button"
                              className={`button ${manageForm.status === "suspended" ? "primary" : "ghost"}`}
                              onClick={() => setManageForm((prev) => ({ ...prev, status: "suspended" }))}
                            >
                              Suspend
                            </button>
                          </div>
                        </div>
                        <div className="form-control">
                          <label>Role</label>
                          <div className="cta-row">
                            <button
                              type="button"
                              className={`button ${manageForm.role === "player" ? "primary" : "ghost"}`}
                              onClick={() => setManageForm((prev) => ({ ...prev, role: "player" }))}
                            >
                              Player
                            </button>
                            <button
                              type="button"
                              className={`button ${manageForm.role === "admin" ? "primary" : "ghost"}`}
                              onClick={() => setManageForm((prev) => ({ ...prev, role: "admin" }))}
                            >
                              Admin
                            </button>
                            <button
                              type="button"
                              className={`button ${manageForm.role === "owner" ? "primary" : "ghost"}`}
                              onClick={() => setManageForm((prev) => ({ ...prev, role: "owner" }))}
                            >
                              Owner
                            </button>
                          </div>
                        </div>
                        {manageForm.status === "suspended" ? (
                          <div className="form-control">
                            <label htmlFor="suspension-reason">Suspension reason (optional)</label>
                            <textarea
                              id="suspension-reason"
                              value={manageForm.reason}
                              onChange={(e) => setManageForm((prev) => ({ ...prev, reason: e.target.value }))}
                              rows={4}
                            />
                          </div>
                        ) : null}
                        <div className="cta-row">
                          <button
                            className="button primary"
                            type="button"
                            onClick={() => void saveManagedUser()}
                            disabled={savingUserId === manageUser.id}
                          >
                            {savingUserId === manageUser.id ? "Saving..." : "Save Changes"}
                          </button>
                          <button className="button ghost" type="button" onClick={closeManageUser}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    </article>
                  </div>
                ) : null}
              </>
            ) : null}
            {activeModule === "contact" ? (
              <>
                <section className="account-card">
                  <h2>Contact Messages</h2>
                  <p className="muted">Messages sent from the public contact form.</p>
                </section>
                <section className="account-card">
                  <div className="account-card__header">
                    <div>
                      <h2>Inbox</h2>
                      <p className="muted">Latest messages appear first. Unread: {unreadContactCount}</p>
                    </div>
                    <button
                      className="button ghost"
                      type="button"
                      onClick={() => void loadContactMessages()}
                      disabled={loadingContactMessages}
                    >
                      {loadingContactMessages ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                  <div className="contact-inbox-toolbar">
                    <div className="contact-inbox-toolbar__filters">
                      <button
                        className={`button ghost${contactFilter === "all" ? " is-active" : ""}`}
                        type="button"
                        onClick={() => setContactFilter("all")}
                      >
                        All
                      </button>
                      <button
                        className={`button ghost${contactFilter === "unread" ? " is-active" : ""}`}
                        type="button"
                        onClick={() => setContactFilter("unread")}
                      >
                        Unread
                      </button>
                      <button
                        className={`button ghost${contactFilter === "read" ? " is-active" : ""}`}
                        type="button"
                        onClick={() => setContactFilter("read")}
                      >
                        Read
                      </button>
                    </div>
                    <div className="search-panel__input contact-inbox-toolbar__search">
                      <input
                        type="search"
                        placeholder="Search name, email, or message"
                        value={contactSearch}
                        onChange={(event) => setContactSearch(event.target.value)}
                        aria-label="Search contact messages"
                      />
                    </div>
                  </div>
                  {contactMessagesError ? <p className="form-help error">{contactMessagesError}</p> : null}
                  {loadingContactMessages ? <p className="muted">Loading messages...</p> : null}
                  {!loadingContactMessages && filteredContactMessages.length === 0 ? (
                    <p className="muted">{contactMessages.length === 0 ? "No contact messages yet." : "No messages match those filters."}</p>
                  ) : null}
                  {!loadingContactMessages && filteredContactMessages.length > 0 ? (
                    <div className="event-list admin-scroll-panel">
                      {filteredContactMessages.map((message) => (
                        <article key={message.id} className={`event-card-simple contact-message-card${message.is_read ? "" : " is-unread"}`}>
                          <div className="event-card__header">
                            <h3>{message.name}</h3>
                            <div className="cta-row">
                              <span className={`pill ${message.is_read ? "pill--muted" : "pill--accent"}`}>
                                {message.is_read ? "Read" : "Unread"}
                              </span>
                              {!message.is_read ? (
                                <button
                                  className="button ghost"
                                  type="button"
                                  onClick={() => void markContactMessageRead(message.id)}
                                  disabled={savingContactMessageId === message.id}
                                >
                                  {savingContactMessageId === message.id ? "Saving..." : "Mark Read"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <div className="event-card__meta">
                            <p className="muted">Email: {message.email}</p>
                            <p className="muted">Received: {formatMessageDate(message.created_at)}</p>
                            {message.read_at ? <p className="muted">Read: {formatMessageDate(message.read_at)}</p> : null}
                          </div>
                          <p className="muted contact-message-card__preview">{message.message}</p>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}
            {activeModule === "flyers" ? (
              <>
                <section className="account-card">
                  <h2>Flyers</h2>
                  <p className="muted">Upload flyer images that appear in each event detail card.</p>
                </section>
                <section className="account-card">
                  <div className="account-card__header">
                    <div>
                      <h2>Event Flyers</h2>
                      <p className="muted">Each event can have one flyer image plus optional details text.</p>
                    </div>
                    <button
                      className="button ghost"
                      type="button"
                      onClick={() => {
                        void loadEvents();
                        void loadFlyers();
                      }}
                      disabled={loadingFlyers || loadingEvents}
                    >
                      {loadingFlyers || loadingEvents ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                  {flyersError ? <p className="form-help error">{flyersError}</p> : null}
                  {flyersStatus.message ? (
                    <p className={`form-help ${flyersStatus.type === "error" ? "error" : "muted"}`}>{flyersStatus.message}</p>
                  ) : null}
                  {loadingFlyers || loadingEvents ? <p className="muted">Loading flyers...</p> : null}
                  {!loadingFlyers && !loadingEvents && events.length === 0 ? <p className="muted">No events found.</p> : null}
                  {!loadingFlyers && !loadingEvents && events.length > 0 ? (
                    <div className="event-list admin-scroll-panel">
                      {events.map((event) => {
                        const flyer = flyerByEventId.get(event.id);
                        const detailsValue = flyerDetailsDrafts[event.id] ?? flyer?.details ?? "";
                        const isFlyerExpanded = Boolean(expandedFlyerPreviews[event.id]);
                        return (
                          <article key={event.id} className="event-card-simple">
                            <div className="event-card__header">
                              <h3>{event.title}</h3>
                            </div>
                            <div className="event-card__meta">
                              <p className="muted">Date: {dateLabel(event.start_date, event.end_date)}</p>
                              <p className="muted">Key: {getFlyerName(event)}</p>
                            </div>
                            {flyer?.flyer_image_url ? (
                              <div style={{ display: "grid", gap: 10 }}>
                                <button
                                  className="button ghost"
                                  type="button"
                                  onClick={() =>
                                    setExpandedFlyerPreviews((prev) => ({
                                      ...prev,
                                      [event.id]: !prev[event.id],
                                    }))
                                  }
                                  style={{ justifySelf: "start" }}
                                >
                                  {isFlyerExpanded ? "Collapse Flyer" : "Expand Flyer"}
                                </button>
                                {isFlyerExpanded ? (
                                  <img
                                    src={flyer.flyer_image_url}
                                    alt={`${event.title} flyer`}
                                    style={{ width: "100%", maxWidth: 420, borderRadius: 12, border: "1px solid var(--border)" }}
                                  />
                                ) : (
                                  <p className="muted">Flyer uploaded. Expand to preview it.</p>
                                )}
                              </div>
                            ) : (
                              <p className="muted">No flyer uploaded yet.</p>
                            )}
                            <div className="form-control admin-flyer-details-field">
                              <label htmlFor={`flyer-details-${event.id}`}>Details</label>
                              <textarea
                                id={`flyer-details-${event.id}`}
                                value={detailsValue}
                                onChange={(e) =>
                                  setFlyerDetailsDrafts((prev) => ({ ...prev, [event.id]: e.target.value }))
                                }
                                rows={4}
                                placeholder="Optional extra event details for the flyer modal."
                              />
                            </div>
                            <div className="cta-row">
                              <label
                                className="button ghost"
                                htmlFor={`flyer-upload-${event.id}`}
                                style={{ padding: "0.45rem 0.75rem" }}
                              >
                                {uploadingFlyerEventId === event.id
                                  ? "Uploading..."
                                  : flyer?.flyer_image_url
                                    ? "Replace Flyer"
                                    : "Upload Flyer"}
                              </label>
                              <input
                                id={`flyer-upload-${event.id}`}
                                type="file"
                                accept="image/*"
                                onChange={(e) => void handleFlyerUpload(event, e)}
                                disabled={uploadingFlyerEventId === event.id}
                                style={{ display: "none" }}
                              />
                              <button
                                className="button ghost"
                                type="button"
                                onClick={() => void handleSaveFlyerDetails(event)}
                                disabled={savingFlyerEventId === event.id}
                              >
                                {savingFlyerEventId === event.id ? "Saving..." : "Save Details"}
                              </button>
                              {flyer ? (
                                <button
                                  className="button ghost"
                                  type="button"
                                  onClick={() => void handleDeleteFlyer(event)}
                                  disabled={deletingFlyerEventId === event.id}
                                >
                                  {deletingFlyerEventId === event.id ? "Deleting..." : "Delete Flyer"}
                                </button>
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
