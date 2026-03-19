"use client";

import Link from "next/link";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";

import { AccessibilityControls } from "@/components/accessibility-controls";
import { supabase } from "@/lib/supabase/client";
import type { Event } from "@/lib/supabase/types";

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
  registration_program_slug: string;
  registration_enabled: boolean;
  waiver_url: string;
  registration_limit: string;
  require_waiver: boolean;
  registration_fields: RegistrationFieldEditor[];
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
  event_id: string;
  event_title: string;
};
type ContactMessage = {
  id: string;
  name: string;
  email: string;
  message: string;
  created_at?: string | null;
};
type UserDirectoryRecord = {
  id: string;
  name: string;
  role?: "player" | "admin" | "owner" | null;
  age?: number | null;
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

const slugifyFieldName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const createEmptyRegistrationField = (): RegistrationFieldEditor => ({
  id: crypto.randomUUID(),
  label: "",
  type: "text",
  required: false,
  placeholder: "",
  optionsText: "",
  expanded: true,
});

const parseRegistrationSchemaState = (value: Event["registration_schema"]): Pick<EventFormState, "require_waiver" | "registration_fields"> => {
  const schema = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const rawFields = Array.isArray(schema?.fields) ? schema.fields : Array.isArray(value) ? value : [];
  const registrationFields = rawFields.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const field = entry as Record<string, unknown>;
    const type = FIELD_TYPE_OPTIONS.includes(field.type as RegistrationFieldType) ? (field.type as RegistrationFieldType) : "text";
    return [{
      id: typeof field.id === "string" && field.id ? field.id : crypto.randomUUID(),
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

export default function AdminPage() {
  const [status, setStatus] = useState<AccessStatus>("loading");
  const [activeModule, setActiveModule] = useState<AdminModule>("none");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [uploadingCreateImage, setUploadingCreateImage] = useState(false);
  const [uploadingEditImageId, setUploadingEditImageId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreateEventForm, setShowCreateEventForm] = useState(false);
  const [formStatus, setFormStatus] = useState<FormStatus>({ type: "idle" });
  const [communityStatus, setCommunityStatus] = useState<FormStatus>({ type: "idle" });
  const [communityContentStatus, setCommunityContentStatus] = useState<FormStatus>({ type: "idle" });
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [communityArticles, setCommunityArticles] = useState<CommunityArticle[]>([]);
  const [loadingCommunity, setLoadingCommunity] = useState(false);
  const [registrations, setRegistrations] = useState<RegistrationRecord[]>([]);
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);
  const [registrationsError, setRegistrationsError] = useState<string | null>(null);
  const [contactMessages, setContactMessages] = useState<ContactMessage[]>([]);
  const [loadingContactMessages, setLoadingContactMessages] = useState(false);
  const [contactMessagesError, setContactMessagesError] = useState<string | null>(null);
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
    registration_program_slug: "",
    registration_enabled: false,
    waiver_url: "",
    registration_limit: "",
    require_waiver: false,
    registration_fields: [],
  });
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
      enabled: false,
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
      enabled: false,
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
      .select("id,title,start_date,end_date,time_info,location,description,host_type,image_url,registration_program_slug,registration_enabled,waiver_url,allow_multiple_registrations,registration_limit,registration_schema")
      .order("start_date", { ascending: true, nullsFirst: false });

    if (!error && data) {
      setEvents(data as Event[]);
    } else {
      setEvents([]);
      setEventsError(error?.message ?? "Could not load events.");
    }
    setLoadingEvents(false);
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

    const { data, error } = await supabase
      .from("contact_messages")
      .select("id,name,email,message,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setContactMessages([]);
      setContactMessagesError(error.message ?? "Could not load contact messages.");
    } else {
      setContactMessages((data ?? []) as ContactMessage[]);
    }

    setLoadingContactMessages(false);
  };

  const loadRegistrations = async () => {
    if (!supabase) return;
    setLoadingRegistrations(true);
    setRegistrationsError(null);

    const { data: submissionData, error: submissionError } = await supabase
      .from("event_submissions")
      .select("id,event_id,user_id,name,email,phone,created_at")
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
      created_at?: string | null;
    }>;

    if (submissions.length === 0) {
      setRegistrations([]);
      setLoadingRegistrations(false);
      return;
    }

    const userIds = Array.from(new Set(submissions.map((row) => row.user_id).filter(Boolean)));

    const [{ data: eventsData, error: eventsError }, { data: profilesData, error: profilesError }] =
      await Promise.all([
        supabase
          .from("events")
          .select("id,title")
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
    const eventById = new Map(((eventsData ?? []) as Array<{ id: string; title: string }>).map((row) => [row.id, row.title]));

    const resolved: RegistrationRecord[] = submissions.map((row) => {
      const profile = profileById.get(row.user_id);
      return {
        id: row.id,
        submitted_at: row.created_at ?? null,
        user_id: row.user_id,
        user_name: profile?.name?.trim() || row.name || "Unknown user",
        user_email: row.email,
        user_phone: row.phone ?? null,
        event_id: row.event_id,
        event_title: eventById.get(row.event_id) ?? "Unknown event",
      };
    });

    setRegistrations(resolved);
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
      registration_program_slug: "",
      registration_enabled: false,
      waiver_url: "",
      registration_limit: "",
      require_waiver: false,
      registration_fields: [],
    });
  };

  const openCreateEventForm = () => {
    resetForm();
    setFormStatus({ type: "idle" });
    setShowCreateEventForm(true);
  };

  const closeCreateEventForm = () => {
    resetForm();
    setFormStatus({ type: "idle" });
    setShowCreateEventForm(false);
  };

  const startEditing = (event: Event) => {
    const registrationState = parseRegistrationSchemaState(event.registration_schema);
    setEditingId(event.id);
    setEditForm({
      title: event.title ?? "",
      start_date: event.start_date ?? "",
      end_date: event.end_date ?? "",
      time_info: event.time_info ?? "",
      location: event.location ?? "",
      description: event.description ?? "",
      host_type: event.host_type ?? "aldrich",
      image_url: event.image_url ?? "",
      registration_program_slug: event.registration_program_slug ?? "",
      registration_enabled: Boolean(event.registration_enabled),
      waiver_url: event.waiver_url ?? "",
      registration_limit: event.registration_limit?.toString() ?? "",
      require_waiver: registrationState.require_waiver,
      registration_fields: registrationState.registration_fields,
    });
    setFormStatus({ type: "idle" });
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const updateEdit = <K extends keyof EventFormState>(key: K, value: EventFormState[K]) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
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

  const renderRegistrationBuilder = (target: "create" | "edit", state: EventFormState) => (
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
        <div>
          <button className="button ghost" type="button" onClick={() => addRegistrationField(target)}>
            Add field
          </button>
        </div>

        {state.registration_fields.length === 0 ? (
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
                      <span>Required foield</span>
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
    const registrationSchema = buildRegistrationSchema(form);
    const payload = {
      title: form.title.trim(),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      time_info: form.time_info.trim() || null,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
      host_type: form.host_type || null,
      image_url: form.image_url.trim() || null,
      registration_program_slug: form.registration_program_slug.trim() || null,
      registration_enabled: form.registration_enabled,
      waiver_url: form.waiver_url.trim() || null,
      allow_multiple_registrations: false,
      registration_limit: form.registration_limit.trim() ? Number(form.registration_limit) : null,
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

  const uploadEventImage = async (file: File) => {
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const baseName = file.name.replace(new RegExp(`\\.${ext}$`, "i"), "");
    const path = `events/${crypto.randomUUID()}-${safeFileName(baseName)}.${ext}`;
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
      const publicUrl = await uploadEventImage(file);
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
    const registrationSchema = buildRegistrationSchema(editForm);
    const payload = {
      title: editForm.title.trim(),
      start_date: editForm.start_date || null,
      end_date: editForm.end_date || null,
      time_info: editForm.time_info.trim() || null,
      location: editForm.location.trim() || null,
      description: editForm.description.trim() || null,
      host_type: editForm.host_type || null,
      image_url: editForm.image_url.trim() || null,
      registration_program_slug: editForm.registration_program_slug.trim() || null,
      registration_enabled: editForm.registration_enabled,
      waiver_url: editForm.waiver_url.trim() || null,
      allow_multiple_registrations: false,
      registration_limit: editForm.registration_limit.trim() ? Number(editForm.registration_limit) : null,
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
      const publicUrl = await uploadEventImage(file);
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
    if (module === "registrations") {
      void loadRegistrations();
    }
    if (module === "community") {
      void loadCommunityArticles();
      void loadCommunityContent();
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

  const updateCommunityEdit = (key: keyof typeof communityEditForm, value: string) => {
    setCommunityEditForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateCommunityContent = (key: keyof typeof communityContentForm, value: string) => {
    setCommunityContentForm((prev) => ({ ...prev, [key]: value }));
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

  const registrationCountByEvent = registrations.reduce<Record<string, number>>((acc, row) => {
    const key = row.event_title || "Unknown event";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const filteredUsers = users.filter((user) => {
    const term = usersSearch.trim().toLowerCase();
    if (!term) return true;
    return (
      user.name.toLowerCase().includes(term) ||
      user.id.toLowerCase().includes(term) ||
      (user.role ?? "player").toLowerCase().includes(term)
    );
  });

  return (
    <div className="account-page">
      <AccessibilityControls />
      <div className="account-body shell">
        <Link className="button ghost" href="/">
          ← Back
        </Link>
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
                      <span>Enable event registration</span>
                    </label>
                  </div>
                  {renderRegistrationBuilder("create", form)}
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
                <div className="event-list">
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
                          Registration: {event.registration_enabled ? "Enabled" : "Disabled"}
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
                              <span>Enable event registration</span>
                            </label>
                          </div>
                          {renderRegistrationBuilder("edit", editForm)}
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
            {activeModule === "community" ? (
              <>
                <section className="account-card">
                  <h2>Community Articles</h2>
                  <p className="muted">Add featured articles shown on the Community page.</p>
                </section>
                <section className="account-card">
                  <h2>Top Community Block</h2>
                  <p className="muted">Edit the title and intro paragraphs shown at the top of the Community page.</p>
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
                      <button className="button ghost" type="button" onClick={() => void loadCommunityContent()}>
                        Reload
                      </button>
                    </div>
                  </form>
                  {communityContentStatus.message ? (
                    <p className={`form-help ${communityContentStatus.type === "error" ? "error" : "muted"}`}>
                      {communityContentStatus.message}
                    </p>
                  ) : null}
                </section>
                <section className="account-card">
                  <h2>Add Article</h2>
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
                      <button className="button ghost" type="button" onClick={resetCommunityForm}>
                        Reset
                      </button>
                    </div>
                  </form>
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
                    <div className="event-list">
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
                  <p className="muted">See who signed up for which event.</p>
                </section>
                <section className="account-card">
                  <div className="account-card__header">
                    <div>
                      <h2>Registration Summary</h2>
                      <p className="muted">Count of signups by event.</p>
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
                    <ul className="list" style={{ display: "grid", gap: 8 }}>
                      {Object.entries(registrationCountByEvent)
                        .sort((a, b) => b[1] - a[1])
                        .map(([eventTitle, count]) => (
                          <li key={eventTitle} className="team-card">
                            <div className="team-card__info">
                              <p className="list__title">{eventTitle}</p>
                              <p className="muted">{count} signup{count === 1 ? "" : "s"}</p>
                            </div>
                          </li>
                        ))}
                    </ul>
                  ) : null}
                </section>
                <section className="account-card">
                  <h2>All Signups</h2>
                  {!loadingRegistrations && registrations.length > 0 ? (
                    <div className="event-list">
                      {registrations.map((row) => (
                        <article key={row.id} className="event-card-simple">
                          <div className="event-card__header">
                            <h3>{row.event_title}</h3>
                          </div>
                          <div className="event-card__meta">
                            <p className="muted">User: {row.user_name}</p>
                            <p className="muted">Email: {row.user_email}</p>
                            {row.user_phone ? <p className="muted">Phone: {row.user_phone}</p> : null}
                            {row.submitted_at ? (
                              <p className="muted">Submitted: {formatMessageDate(row.submitted_at)}</p>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </section>
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
                  <div className="form-control" style={{ marginTop: 12 }}>
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
                    <div style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(160px, 2fr) minmax(90px, 1fr) minmax(110px, 1fr) auto",
                          gap: 12,
                          padding: "10px 14px",
                          borderBottom: "1px solid var(--border)",
                          fontWeight: 700,
                        }}
                      >
                        <span>USER</span>
                        <span>ROLE</span>
                        <span>STATUS</span>
                        <span style={{ textAlign: "right" }}>ACTIONS</span>
                      </div>
                      {filteredUsers.map((user) => {
                        const isSuspended = user.suspended === true;
                        return (
                          <div
                            key={user.id}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "minmax(160px, 2fr) minmax(90px, 1fr) minmax(110px, 1fr) auto",
                              gap: 12,
                              padding: "12px 14px",
                              borderBottom: "1px solid var(--border)",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <p className="list__title">{user.name || "Unnamed user"}</p>
                              <p className="muted">{user.id}</p>
                            </div>
                            <p style={{ margin: 0, textTransform: "capitalize" }}>{user.role ?? "player"}</p>
                            <span className={`pill ${isSuspended ? "pill--amber" : "pill--green"}`}>
                              {isSuspended ? "Suspended" : "Active"}
                            </span>
                            <div style={{ textAlign: "right" }}>
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
                              rows={3}
                              value={manageForm.reason}
                              onChange={(e) => setManageForm((prev) => ({ ...prev, reason: e.target.value }))}
                            />
                          </div>
                        ) : null}
                      </div>
                      <div className="cta-row" style={{ marginTop: 18 }}>
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
                      <p className="muted">Latest messages appear first.</p>
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
                  {contactMessagesError ? <p className="form-help error">{contactMessagesError}</p> : null}
                  {loadingContactMessages ? <p className="muted">Loading messages...</p> : null}
                  {!loadingContactMessages && contactMessages.length === 0 ? (
                    <p className="muted">No contact messages yet.</p>
                  ) : null}
                  {!loadingContactMessages && contactMessages.length > 0 ? (
                    <div className="event-list">
                      {contactMessages.map((message) => (
                        <article key={message.id} className="event-card-simple">
                          <div className="event-card__header">
                            <h3>{message.name}</h3>
                          </div>
                          <div className="event-card__meta">
                            <p className="muted">Email: {message.email}</p>
                            <p className="muted">Received: {formatMessageDate(message.created_at)}</p>
                          </div>
                          <p className="muted">{message.message}</p>
                        </article>
                      ))}
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
