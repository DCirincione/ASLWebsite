"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";

import { AccessibilityControls } from "@/components/accessibility-controls";
import { HistoryBackButton } from "@/components/history-back-button";
import { PartnerApplicationForm } from "@/components/partner-application-form";
import {
  buildRegistrationSchema,
  createEmptyRegistrationField,
  FIELD_TYPE_OPTIONS,
  parseRegistrationSchemaState,
  type RegistrationFieldEditor,
  type RegistrationFieldType,
} from "@/lib/event-registration-schema";
import { canAccessPartnerPortal, formatApprovalStatusLabel } from "@/lib/event-approval";
import { formatEventPaymentAmount } from "@/lib/event-payments";
import {
  createEmptyPartnerApplicationForm,
  createEmptyPartnerApplicationTeamMember,
  type PartnerApplicationSubmission,
  type PartnerApplicationTeamMember,
} from "@/lib/partner-application";
import { createId } from "@/lib/create-id";
import { getEventProgramSlugOptions } from "@/lib/sports";
import { supabase } from "@/lib/supabase/client";
import type { Event, Profile, Sport } from "@/lib/supabase/types";

type AccessStatus = "loading" | "allowed" | "no-session" | "forbidden";
type SaveStatus = { type: "idle" | "loading" | "success" | "error"; message?: string };
const EVENT_IMAGE_BUCKET = "event-creation-uploads";
const FLYER_BUCKET = "flyers";

type PartnerApplicationDraftSummary = {
  id: string;
  status: "pending" | "completed" | "failed" | "expired";
  checkoutUrl?: string | null;
  completedAt?: string | null;
  error?: string | null;
};

type PartnerEventRecord = Event & {
  flyer_image_url?: string | null;
  flyer_details?: string | null;
  signup_count?: number;
  paid_signup_count?: number;
  earned_amount_cents?: number;
};

type PartnerSignupRecord = {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_phone?: string | null;
  submitted_at?: string | null;
  paid_amount_cents?: number | null;
};

type PartnerEventFormState = {
  title: string;
  start_date: string;
  end_date: string;
  time_info: string;
  location: string;
  image_url: string;
  flyer_image_url: string;
  flyer_details: string;
  signup_mode: "registration" | "waitlist";
  registration_program_slug: string;
  sport_id: string;
  registration_enabled: boolean;
  waiver_url: string;
  registration_limit: string;
  payment_required: boolean;
  payment_amount: string;
  require_waiver: boolean;
  registration_fields: RegistrationFieldEditor[];
};

const emptyForm = (): PartnerEventFormState => ({
  title: "",
  start_date: "",
  end_date: "",
  time_info: "",
  location: "",
  image_url: "",
  flyer_image_url: "",
  flyer_details: "",
  signup_mode: "registration",
  registration_program_slug: "",
  sport_id: "",
  registration_enabled: true,
  waiver_url: "",
  registration_limit: "",
  payment_required: false,
  payment_amount: "",
  require_waiver: false,
  registration_fields: [],
});

const mapEventToForm = (event: PartnerEventRecord): PartnerEventFormState => {
  const registrationState = parseRegistrationSchemaState(event.registration_schema);

  return {
    title: event.title ?? "",
    start_date: event.start_date ?? "",
    end_date: event.end_date ?? "",
    time_info: event.time_info ?? "",
    location: event.location ?? "",
    image_url: event.image_url ?? "",
    flyer_image_url: event.flyer_image_url ?? "",
    flyer_details: event.flyer_details ?? "",
    signup_mode: "registration",
    registration_program_slug: event.registration_program_slug ?? "",
    sport_id: event.sport_id ?? "",
    registration_enabled: true,
    waiver_url: event.waiver_url ?? "",
    registration_limit: event.registration_limit?.toString() ?? "",
    payment_required: Boolean(event.payment_required),
    payment_amount: event.payment_amount_cents ? (event.payment_amount_cents / 100).toFixed(2) : "",
    require_waiver: registrationState.require_waiver,
    registration_fields: registrationState.registration_fields,
  };
};

const parseDateUTC = (value?: string | null) => {
  if (!value) return null;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null;
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day));
};

const formatDateRange = (start?: string | null, end?: string | null) => {
  if (!start && !end) return "Date TBD";
  const startDate = parseDateUTC(start);
  const endDate = parseDateUTC(end);
  const formatOptions: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };

  if (startDate && endDate) {
    if (startDate.getTime() === endDate.getTime()) {
      return startDate.toLocaleDateString(undefined, formatOptions);
    }
    return `${startDate.toLocaleDateString(undefined, formatOptions)} - ${endDate.toLocaleDateString(undefined, formatOptions)}`;
  }

  return startDate?.toLocaleDateString(undefined, formatOptions) ?? endDate?.toLocaleDateString(undefined, formatOptions) ?? "Date TBD";
};

const formatSubmissionDate = (value?: string | null) => {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const isPdfFile = (file: File) =>
  file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

export default function PartnerPage() {
  const [status, setStatus] = useState<AccessStatus>("loading");
  const [profile, setProfile] = useState<Pick<Profile, "id" | "name" | "role"> | null>(null);
  const [sports, setSports] = useState<Sport[]>([]);
  const [events, setEvents] = useState<PartnerEventRecord[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [showCreateEventForm, setShowCreateEventForm] = useState(false);
  const [form, setForm] = useState<PartnerEventFormState>(emptyForm());
  const [editForm, setEditForm] = useState<PartnerEventFormState>(emptyForm());
  const [formStatus, setFormStatus] = useState<SaveStatus>({ type: "idle" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [requestingPayoutId, setRequestingPayoutId] = useState<string | null>(null);
  const [payoutStatuses, setPayoutStatuses] = useState<Record<string, SaveStatus>>({});
  const [openSignupsEventId, setOpenSignupsEventId] = useState<string | null>(null);
  const [loadingSignupsEventId, setLoadingSignupsEventId] = useState<string | null>(null);
  const [signupsByEventId, setSignupsByEventId] = useState<Record<string, PartnerSignupRecord[]>>({});
  const [signupsErrorByEventId, setSignupsErrorByEventId] = useState<Record<string, string>>({});
  const [uploadingCreateImage, setUploadingCreateImage] = useState(false);
  const [uploadingEditImageId, setUploadingEditImageId] = useState<string | null>(null);
  const [uploadingCreateFlyer, setUploadingCreateFlyer] = useState(false);
  const [uploadingEditFlyerId, setUploadingEditFlyerId] = useState<string | null>(null);
  const [uploadingCreateWaiver, setUploadingCreateWaiver] = useState(false);
  const [uploadingEditWaiverId, setUploadingEditWaiverId] = useState<string | null>(null);
  const [partnerApplicationForm, setPartnerApplicationForm] = useState<PartnerApplicationSubmission>(createEmptyPartnerApplicationForm());
  const [partnerApplicationStatus, setPartnerApplicationStatus] = useState<SaveStatus>({ type: "idle" });
  const [partnerApplicationDraft, setPartnerApplicationDraft] = useState<PartnerApplicationDraftSummary | null>(null);
  const [loadingPartnerApplicationDraft, setLoadingPartnerApplicationDraft] = useState(false);
  const [uploadingPartnerLogo, setUploadingPartnerLogo] = useState(false);

  const fetchWithSession = useCallback(async (input: string, init?: RequestInit) => {
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }

    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) {
      throw new Error("You need to be signed in.");
    }

    return fetch(input, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        ...(init?.headers ?? {}),
      },
    });
  }, []);

  const loadPartnerApplicationDraft = useCallback(async () => {
    setLoadingPartnerApplicationDraft(true);
    try {
      const response = await fetchWithSession("/api/partner/apply");
      const json = (await response.json().catch(() => null)) as
        | {
            error?: string;
            draft?: PartnerApplicationDraftSummary | null;
          }
        | null;

      if (!response.ok) {
        throw new Error(json?.error ?? "Could not load your partner application status.");
      }

      setPartnerApplicationDraft(json?.draft ?? null);
    } catch {
      setPartnerApplicationDraft(null);
    } finally {
      setLoadingPartnerApplicationDraft(false);
    }
  }, [fetchWithSession]);

  const loadPartnerEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const response = await fetchWithSession("/api/partner/events");
      const json = (await response.json().catch(() => null)) as { error?: string; events?: PartnerEventRecord[] } | null;
      if (!response.ok) {
        throw new Error(json?.error ?? "Could not load your events.");
      }
      setEvents(json?.events ?? []);
    } catch (error) {
      setFormStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Could not load your events.",
      });
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, [fetchWithSession]);

  const loadSports = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("sports").select("id,title,section_headers").order("title", { ascending: true });
    if (error) {
      setSports([]);
      return;
    }
    setSports((data ?? []) as Sport[]);
  }, []);

  useEffect(() => {
    const loadPage = async () => {
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

      const { data: profileData } = await supabase.from("profiles").select("id,name,role").eq("id", userId).maybeSingle();

      setProfile((profileData as Pick<Profile, "id" | "name" | "role"> | null) ?? null);

      if (!canAccessPartnerPortal(profileData?.role)) {
        setStatus("forbidden");
        await loadPartnerApplicationDraft();
        return;
      }

      setStatus("allowed");
      await loadSports();
      await loadPartnerEvents();
    };

    void loadPage();
  }, [loadPartnerApplicationDraft, loadPartnerEvents, loadSports]);

  const updateCreateForm = <K extends keyof PartnerEventFormState>(key: K, value: PartnerEventFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateCreateSportId = (sportId: string) => {
    setForm((prev) => {
      const nextSport = sports.find((sport) => sport.id === sportId) ?? null;
      const nextOptions = getEventProgramSlugOptions(nextSport);
      const currentValueStillValid = nextOptions.some((option) => option.value === prev.registration_program_slug);

      return {
        ...prev,
        sport_id: sportId,
        registration_program_slug: currentValueStillValid ? prev.registration_program_slug : (nextOptions[0]?.value ?? ""),
      };
    });
  };

  const updateEditForm = <K extends keyof PartnerEventFormState>(key: K, value: PartnerEventFormState[K]) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateEditSportId = (sportId: string) => {
    setEditForm((prev) => {
      const nextSport = sports.find((sport) => sport.id === sportId) ?? null;
      const nextOptions = getEventProgramSlugOptions(nextSport);
      const currentValueStillValid = nextOptions.some((option) => option.value === prev.registration_program_slug);

      return {
        ...prev,
        sport_id: sportId,
        registration_program_slug: currentValueStillValid ? prev.registration_program_slug : (nextOptions[0]?.value ?? ""),
      };
    });
  };

  const updateRegistrationField = (
    target: "create" | "edit",
    fieldId: string,
    key: keyof RegistrationFieldEditor,
    value: RegistrationFieldEditor[keyof RegistrationFieldEditor],
  ) => {
    const apply = (prev: PartnerEventFormState) => ({
      ...prev,
      registration_fields: prev.registration_fields.map((field) =>
        field.id === fieldId ? ({ ...field, [key]: value } as RegistrationFieldEditor) : field,
      ),
    });

    if (target === "create") {
      setForm(apply);
      return;
    }

    setEditForm(apply);
  };

  const addRegistrationField = (target: "create" | "edit") => {
    const nextField = createEmptyRegistrationField();
    const apply = (prev: PartnerEventFormState) => ({
      ...prev,
      registration_fields: [...prev.registration_fields, nextField],
    });

    if (target === "create") {
      setForm(apply);
      return;
    }

    setEditForm(apply);
  };

  const toggleRegistrationFieldExpanded = (target: "create" | "edit", fieldId: string) => {
    const apply = (prev: PartnerEventFormState) => ({
      ...prev,
      registration_fields: prev.registration_fields.map((field) =>
        field.id === fieldId ? { ...field, expanded: !field.expanded } : field,
      ),
    });

    if (target === "create") {
      setForm(apply);
      return;
    }

    setEditForm(apply);
  };

  const collapseRegistrationField = (target: "create" | "edit", fieldId: string) => {
    const apply = (prev: PartnerEventFormState) => ({
      ...prev,
      registration_fields: prev.registration_fields.map((field) =>
        field.id === fieldId ? { ...field, expanded: false } : field,
      ),
    });

    if (target === "create") {
      setForm(apply);
      return;
    }

    setEditForm(apply);
  };

  const removeRegistrationField = (target: "create" | "edit", fieldId: string) => {
    const apply = (prev: PartnerEventFormState) => ({
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
    const apply = (prev: PartnerEventFormState) => {
      const index = prev.registration_fields.findIndex((field) => field.id === fieldId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.registration_fields.length) {
        return prev;
      }

      const nextFields = [...prev.registration_fields];
      const [field] = nextFields.splice(index, 1);
      nextFields.splice(nextIndex, 0, field);

      return {
        ...prev,
        registration_fields: nextFields,
      };
    };

    if (target === "create") {
      setForm(apply);
      return;
    }

    setEditForm(apply);
  };

  const openCreateEventForm = () => {
    setForm(emptyForm());
    setFormStatus({ type: "idle" });
    setShowCreateEventForm(true);
  };

  const closeCreateEventForm = () => {
    setForm(emptyForm());
    setFormStatus({ type: "idle" });
    setShowCreateEventForm(false);
  };

  const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

  const uploadManagedAsset = async (
    folder: "events" | "events/waivers" | "partner-applications/logos",
    file: File,
  ) => {
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

  const uploadFlyerImage = async (file: File) => {
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const baseName = file.name.replace(new RegExp(`\\.${ext}$`, "i"), "");
    const path = `events/${createId()}-${safeFileName(baseName)}.${ext}`;
    const { data, error } = await supabase.storage.from(FLYER_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (error) throw error;

    const finalPath = data?.path ?? path;
    const { data: publicUrlData } = supabase.storage.from(FLYER_BUCKET).getPublicUrl(finalPath);
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
      const publicUrl = await uploadManagedAsset("events", file);
      setForm((prev) => ({ ...prev, image_url: publicUrl }));
      setFormStatus({ type: "success", message: "Image uploaded. The generated URL was added to the field. Click Create Event to save it." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload image.";
      setFormStatus({ type: "error", message: `${message} (Bucket: ${EVENT_IMAGE_BUCKET})` });
    } finally {
      setUploadingCreateImage(false);
      e.target.value = "";
    }
  };

  const handleEditImageUpload = async (eventId: string, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormStatus({ type: "error", message: "Please select a valid image file." });
      return;
    }

    try {
      setUploadingEditImageId(eventId);
      const publicUrl = await uploadManagedAsset("events", file);
      setEditForm((prev) => ({ ...prev, image_url: publicUrl }));
      setFormStatus({ type: "success", message: "Image uploaded. The generated URL was added to the field. Click Save Changes to update the event." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload image.";
      setFormStatus({ type: "error", message: `${message} (Bucket: ${EVENT_IMAGE_BUCKET})` });
    } finally {
      setUploadingEditImageId(null);
      e.target.value = "";
    }
  };

  const handleCreateFlyerUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormStatus({ type: "error", message: "Please select a valid flyer image file." });
      return;
    }

    try {
      setUploadingCreateFlyer(true);
      const publicUrl = await uploadFlyerImage(file);
      setForm((prev) => ({ ...prev, flyer_image_url: publicUrl }));
      setFormStatus({ type: "success", message: "Flyer uploaded. The generated URL was added to the field. Click Create Event to save it." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload flyer.";
      setFormStatus({ type: "error", message: `${message} (Bucket: ${FLYER_BUCKET})` });
    } finally {
      setUploadingCreateFlyer(false);
      e.target.value = "";
    }
  };

  const handleEditFlyerUpload = async (eventId: string, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormStatus({ type: "error", message: "Please select a valid flyer image file." });
      return;
    }

    try {
      setUploadingEditFlyerId(eventId);
      const publicUrl = await uploadFlyerImage(file);
      setEditForm((prev) => ({ ...prev, flyer_image_url: publicUrl }));
      setFormStatus({ type: "success", message: "Flyer uploaded. The generated URL was added to the field. Click Save Changes to update the event." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload flyer.";
      setFormStatus({ type: "error", message: `${message} (Bucket: ${FLYER_BUCKET})` });
    } finally {
      setUploadingEditFlyerId(null);
      e.target.value = "";
    }
  };

  const handleCreateWaiverUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isPdfFile(file)) {
      setFormStatus({ type: "error", message: "Please select a PDF waiver file." });
      return;
    }

    try {
      setUploadingCreateWaiver(true);
      const publicUrl = await uploadManagedAsset("events/waivers", file);
      setForm((prev) => ({ ...prev, waiver_url: publicUrl, require_waiver: true }));
      setFormStatus({
        type: "success",
        message: "Waiver PDF uploaded. The generated URL was added to the form and waiver acceptance was enabled.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload waiver PDF.";
      setFormStatus({ type: "error", message: `${message} (Bucket: ${EVENT_IMAGE_BUCKET})` });
    } finally {
      setUploadingCreateWaiver(false);
      e.target.value = "";
    }
  };

  const handleEditWaiverUpload = async (eventId: string, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isPdfFile(file)) {
      setFormStatus({ type: "error", message: "Please select a PDF waiver file." });
      return;
    }

    try {
      setUploadingEditWaiverId(eventId);
      const publicUrl = await uploadManagedAsset("events/waivers", file);
      setEditForm((prev) => ({ ...prev, waiver_url: publicUrl, require_waiver: true }));
      setFormStatus({
        type: "success",
        message: "Waiver PDF uploaded. The generated URL was added to the form and waiver acceptance was enabled.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload waiver PDF.";
      setFormStatus({ type: "error", message: `${message} (Bucket: ${EVENT_IMAGE_BUCKET})` });
    } finally {
      setUploadingEditWaiverId(null);
      e.target.value = "";
    }
  };

  const updatePartnerApplicationForm = <K extends keyof PartnerApplicationSubmission>(
    key: K,
    value: PartnerApplicationSubmission[K],
  ) => {
    setPartnerApplicationForm((prev) => {
      const next = {
        ...prev,
        [key]: value,
      } as PartnerApplicationSubmission;

      if (key === "isNonProfit") {
        next.selectedPlan = value === true ? "nonprofit" : "standard";
      }

      return next;
    });
  };

  const togglePartnerApplicationSelection = (
    key: "sportsOffered" | "postingTypes",
    value: string,
  ) => {
    setPartnerApplicationForm((prev) => {
      const currentValues = [...prev[key]] as string[];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((entry) => entry !== value)
        : [...currentValues, value];

      return {
        ...prev,
        [key]: nextValues,
        ...(key === "sportsOffered" && !nextValues.includes("other") ? { otherSport: "" } : {}),
        ...(key === "postingTypes" && !nextValues.includes("other") ? { otherPostingType: "" } : {}),
      };
    });
  };

  const addPartnerApplicationTeamMember = () => {
    setPartnerApplicationForm((prev) => {
      if (prev.teamMembers.length >= 5) return prev;
      return {
        ...prev,
        teamMembers: [...prev.teamMembers, createEmptyPartnerApplicationTeamMember()],
      };
    });
  };

  const updatePartnerApplicationTeamMember = (
    teamMemberId: string,
    key: keyof PartnerApplicationTeamMember,
    value: string,
  ) => {
    setPartnerApplicationForm((prev) => ({
      ...prev,
      teamMembers: prev.teamMembers.map((teamMember) =>
        teamMember.id === teamMemberId ? { ...teamMember, [key]: value } : teamMember,
      ),
    }));
  };

  const removePartnerApplicationTeamMember = (teamMemberId: string) => {
    setPartnerApplicationForm((prev) => ({
      ...prev,
      teamMembers: prev.teamMembers.filter((teamMember) => teamMember.id !== teamMemberId),
    }));
  };

  const handlePartnerLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPartnerApplicationStatus({ type: "error", message: "Please select a valid logo image file." });
      return;
    }

    try {
      setUploadingPartnerLogo(true);
      const publicUrl = await uploadManagedAsset("partner-applications/logos", file);
      setPartnerApplicationForm((prev) => ({ ...prev, logoUrl: publicUrl }));
      setPartnerApplicationStatus({ type: "success", message: "Logo uploaded successfully." });
    } catch (error) {
      setPartnerApplicationStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Could not upload the organization logo.",
      });
    } finally {
      setUploadingPartnerLogo(false);
      e.target.value = "";
    }
  };

  const resumePartnerApplicationCheckout = () => {
    if (!partnerApplicationDraft?.checkoutUrl) return;
    window.location.assign(partnerApplicationDraft.checkoutUrl);
  };

  const submitPartnerApplication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPartnerApplicationStatus({ type: "loading" });

    try {
      const response = await fetchWithSession("/api/partner/apply", {
        method: "POST",
        body: JSON.stringify({
          application: partnerApplicationForm,
        }),
      });
      const json = (await response.json().catch(() => null)) as
        | {
            error?: string;
            checkoutUrl?: string | null;
          }
        | null;

      if (!response.ok) {
        throw new Error(json?.error ?? "Could not start the partner application checkout.");
      }
      if (!json?.checkoutUrl) {
        throw new Error("Square checkout did not return a redirect URL.");
      }

      setPartnerApplicationStatus({ type: "success", message: "Redirecting to checkout..." });
      window.location.assign(json.checkoutUrl);
    } catch (error) {
      setPartnerApplicationStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Could not start the partner application checkout.",
      });
      await loadPartnerApplicationDraft();
    }
  };

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    setFormStatus({ type: "loading" });

    try {
      const payload = {
        ...form,
        registration_schema: buildRegistrationSchema(form),
      };
      const response = await fetchWithSession("/api/partner/events", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(json?.error ?? "Could not create the event.");
      }

      setFormStatus({ type: "success", message: "Event saved and sent to the owner approval queue." });
      setForm(emptyForm());
      setShowCreateEventForm(false);
      await loadPartnerEvents();
    } catch (error) {
      setFormStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Could not create the event.",
      });
    }
  };

  const submitEdit = async (eventId: string) => {
    setSavingEditId(eventId);
    setFormStatus({ type: "idle" });

    try {
      const payload = {
        ...editForm,
        registration_schema: buildRegistrationSchema(editForm),
      };
      const response = await fetchWithSession(`/api/partner/events/${eventId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(json?.error ?? "Could not update the event.");
      }

      setEditingId(null);
      setFormStatus({ type: "success", message: "Changes saved and sent back for owner approval." });
      await loadPartnerEvents();
    } catch (error) {
      setFormStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Could not update the event.",
      });
    } finally {
      setSavingEditId(null);
    }
  };

  const deleteEvent = async (eventId: string, title: string) => {
    const confirmed = window.confirm(`Delete "${title}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingId(eventId);
    setFormStatus({ type: "idle" });

    try {
      const response = await fetchWithSession(`/api/partner/events/${eventId}`, {
        method: "DELETE",
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(json?.error ?? "Could not delete the event.");
      }

      if (editingId === eventId) {
        setEditingId(null);
      }
      setFormStatus({ type: "success", message: "Event deleted." });
      await loadPartnerEvents();
    } catch (error) {
      setFormStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Could not delete the event.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const requestPayout = async (event: PartnerEventRecord) => {
    const earnedAmountCents = event.earned_amount_cents ?? 0;
    if (earnedAmountCents <= 0) {
      setPayoutStatuses((prev) => ({
        ...prev,
        [event.id]: { type: "error", message: "This event does not have any payout balance yet." },
      }));
      return;
    }

    const confirmed = window.confirm(
      `Send a payout request for "${event.title}" for ${formatEventPaymentAmount(earnedAmountCents)}?`,
    );
    if (!confirmed) return;

    setRequestingPayoutId(event.id);
    setPayoutStatuses((prev) => ({ ...prev, [event.id]: { type: "loading" } }));

    try {
      const response = await fetchWithSession("/api/partner/payout-request", {
        method: "POST",
        body: JSON.stringify({ eventId: event.id }),
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(json?.error ?? "Could not send the payout request.");
      }

      setPayoutStatuses((prev) => ({
        ...prev,
        [event.id]: {
          type: "success",
          message: `Payout request sent for ${formatEventPaymentAmount(earnedAmountCents)}.`,
        },
      }));
    } catch (error) {
      setPayoutStatuses((prev) => ({
        ...prev,
        [event.id]: {
          type: "error",
          message: error instanceof Error ? error.message : "Could not send the payout request.",
        },
      }));
    } finally {
      setRequestingPayoutId(null);
    }
  };

  const toggleEventSignups = async (event: PartnerEventRecord) => {
    const eventId = event.id;
    if (openSignupsEventId === eventId) {
      setOpenSignupsEventId(null);
      return;
    }

    setOpenSignupsEventId(eventId);

    if (signupsByEventId[eventId] || loadingSignupsEventId === eventId) {
      return;
    }

    setLoadingSignupsEventId(eventId);
    setSignupsErrorByEventId((prev) => {
      const next = { ...prev };
      delete next[eventId];
      return next;
    });

    try {
      const response = await fetchWithSession(`/api/partner/events/${eventId}/signups`);
      const json = (await response.json().catch(() => null)) as { error?: string; signups?: PartnerSignupRecord[] } | null;
      if (!response.ok) {
        throw new Error(json?.error ?? "Could not load event signups.");
      }

      setSignupsByEventId((prev) => ({
        ...prev,
        [eventId]: json?.signups ?? [],
      }));
    } catch (error) {
      setSignupsErrorByEventId((prev) => ({
        ...prev,
        [eventId]: error instanceof Error ? error.message : "Could not load event signups.",
      }));
    } finally {
      setLoadingSignupsEventId(null);
    }
  };

  const totalSignupCount = events.reduce((sum, event) => sum + (event.signup_count ?? 0), 0);
  const totalEarnedAmountCents = events.reduce((sum, event) => sum + (event.earned_amount_cents ?? 0), 0);

  if (status === "loading") {
    return (
      <div className="account-page">
        <AccessibilityControls />
        <div className="account-body shell">
          <p className="muted">Loading partner portal...</p>
        </div>
      </div>
    );
  }

  if (status === "no-session") {
    return (
      <div className="account-page">
        <AccessibilityControls />
        <div className="account-body shell">
          <section className="account-card account-card__intro">
            <h1>Partner Portal</h1>
            <p className="muted">
              Apply for a partner account to publish organization events, manage your submissions, and request
              payouts after approved paid signups.
            </p>
          </section>
          <section className="account-card">
            <h2>Sign In to Apply</h2>
            <p className="muted">
              You need an account before you can upload your organization details and complete the required checkout.
            </p>
            <div className="cta-row">
              <Link className="button primary" href="/account/create">
                Create Account / Sign In
              </Link>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (status === "forbidden") {
    return (
      <div className="account-page">
        <AccessibilityControls />
        <div className="account-body shell">
          <HistoryBackButton label="← Back" fallbackHref="/account" />

          <section className="account-card account-card__intro">
            <h1>Partner Portal</h1>
            <p className="muted">
              Your account does not have partner access yet. Submit the application below and complete checkout to
              send your request for admin review.
            </p>
            {profile?.name ? <p className="muted">Signed in as {profile.name}.</p> : null}
          </section>

          {loadingPartnerApplicationDraft ? <p className="muted">Loading your application status...</p> : null}

          <PartnerApplicationForm
            form={partnerApplicationForm}
            status={partnerApplicationStatus}
            uploadingLogo={uploadingPartnerLogo}
            existingDraft={partnerApplicationDraft}
            onSubmit={submitPartnerApplication}
            onChange={updatePartnerApplicationForm}
            onToggleSelection={togglePartnerApplicationSelection}
            onAddTeamMember={addPartnerApplicationTeamMember}
            onUpdateTeamMember={updatePartnerApplicationTeamMember}
            onRemoveTeamMember={removePartnerApplicationTeamMember}
            onLogoUpload={handlePartnerLogoUpload}
            onResumeCheckout={resumePartnerApplicationCheckout}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="account-page">
      <AccessibilityControls />
      <div className="account-body shell">
        <HistoryBackButton label="← Back" fallbackHref="/account" />

        <section className="account-card account-card__intro">
          <h1>Partner Portal</h1>
          <p className="muted">
            Create your own events, edit only your events, and send every version through owner approval before it goes live.
          </p>
          {profile?.name ? <p className="muted">Signed in as {profile.name}.</p> : null}
          <p className="form-help muted">
            If you edit an already approved partner event, it moves back into pending approval until an owner signs off again.
          </p>
        </section>

        <section className="account-card">
          <div className="account-card__header">
            <div>
              <h2>Create Event</h2>
              <p className="muted">Open the event builder when you want to add a new partner event.</p>
            </div>
            {!showCreateEventForm ? (
              <button className="button primary" type="button" onClick={openCreateEventForm}>
                Create Event
              </button>
            ) : null}
          </div>
          {showCreateEventForm ? (
            <form className="register-form" onSubmit={submitCreate}>
              <PartnerEventFields
                target="create"
                idPrefix="create"
                form={form}
                sports={sports}
                update={updateCreateForm}
                updateSportId={updateCreateSportId}
                updateRegistrationField={updateRegistrationField}
                addRegistrationField={addRegistrationField}
                toggleRegistrationFieldExpanded={toggleRegistrationFieldExpanded}
                collapseRegistrationField={collapseRegistrationField}
                removeRegistrationField={removeRegistrationField}
                moveRegistrationField={moveRegistrationField}
                uploadingImage={uploadingCreateImage}
                uploadingFlyer={uploadingCreateFlyer}
                uploadingWaiver={uploadingCreateWaiver}
                onImageUpload={handleCreateImageUpload}
                onFlyerUpload={handleCreateFlyerUpload}
                onWaiverUpload={handleCreateWaiverUpload}
              />
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
            <p className={`form-help ${formStatus.type === "error" ? "error" : formStatus.type === "success" ? "success" : "muted"}`}>
              {formStatus.message}
            </p>
          ) : null}
        </section>

        <section className="account-card">
          <div className="account-card__header">
            <div>
              <h2>Your Events</h2>
              <p className="muted">Only events created under your partner account appear here.</p>
              {!loadingEvents && events.length > 0 ? (
                <div className="partner-events-summary">
                  <span className="pill pill--muted">{events.length} event{events.length === 1 ? "" : "s"}</span>
                  <span className="pill pill--muted">{totalSignupCount} signup{totalSignupCount === 1 ? "" : "s"} tracked</span>
                  <span className="pill pill--green">{formatEventPaymentAmount(totalEarnedAmountCents)} earned</span>
                </div>
              ) : null}
            </div>
            <button className="button ghost" type="button" onClick={() => void loadPartnerEvents()} disabled={loadingEvents}>
              {loadingEvents ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          {loadingEvents ? <p className="muted">Loading your events...</p> : null}
          {!loadingEvents && events.length === 0 ? (
            <p className="muted">You have not created any partner events yet.</p>
          ) : (
            <div className="event-list admin-existing-events-list">
              {events.map((event) => (
                <article key={event.id} className="event-card-simple">
                  <div className="event-card__header">
                    <h3>{event.title}</h3>
                  </div>
                  <div className="event-card__meta">
                    <p className="muted">Approval: {formatApprovalStatusLabel(event.approval_status)}</p>
                    <p className="muted">Date: {formatDateRange(event.start_date, event.end_date)}</p>
                    {event.time_info ? <p className="muted">Time: {event.time_info}</p> : null}
                    {event.location ? <p className="muted">Location: {event.location}</p> : null}
                    {event.registration_program_slug ? <p className="muted">Event type: {event.registration_program_slug}</p> : null}
                    {event.sport_id ? <p className="muted">Sport: {sports.find((sport) => sport.id === event.sport_id)?.title ?? event.sport_id}</p> : null}
                    <p className="muted">
                      Signup mode: {event.signup_mode === "waitlist" ? "Waitlist / interest" : "Registration"}
                    </p>
                    <p className="muted">Signups: {event.registration_enabled ? "Open" : "Closed"}</p>
                    <div className="partner-event-card__stats">
                      <button
                        className="partner-event-card__stat partner-event-card__stat-button"
                        type="button"
                        onClick={() => void toggleEventSignups(event)}
                      >
                        <span className="partner-event-card__stat-label">Total Signups</span>
                        <strong className="partner-event-card__stat-value">{event.signup_count ?? 0} total signups</strong>
                        <span className="partner-event-card__stat-hint">
                          {openSignupsEventId === event.id ? "Hide signup list" : "View who signed up"}
                        </span>
                      </button>
                      <div className="partner-event-card__stat">
                        <span className="partner-event-card__stat-label">Paid Signups</span>
                        <strong className="partner-event-card__stat-value">{event.paid_signup_count ?? 0}</strong>
                      </div>
                      <div className="partner-event-card__stat">
                        <span className="partner-event-card__stat-label">Earned</span>
                        <strong className="partner-event-card__stat-value">
                          {formatEventPaymentAmount(event.earned_amount_cents ?? 0)}
                        </strong>
                      </div>
                    </div>
                    <p className="muted">
                      {event.payment_required
                        ? `Ticket price: ${formatEventPaymentAmount(event.payment_amount_cents ?? 0)}`
                        : "This event does not collect signup payments."}
                    </p>
                    {event.approval_notes ? <p className="muted">Owner notes: {event.approval_notes}</p> : null}
                  </div>
                  {event.description ? <p className="muted">{event.description}</p> : null}
                  {openSignupsEventId === event.id ? (
                    <div className="partner-signups-panel">
                      <div className="event-card__header">
                        <div>
                          <h4 className="partner-signups-panel__title">Signup List</h4>
                          <p className="muted">
                            {event.signup_count ?? 0} signup{event.signup_count === 1 ? "" : "s"} for this event.
                          </p>
                        </div>
                      </div>
                      {loadingSignupsEventId === event.id ? <p className="muted">Loading signups...</p> : null}
                      {signupsErrorByEventId[event.id] ? <p className="form-help error">{signupsErrorByEventId[event.id]}</p> : null}
                      {loadingSignupsEventId !== event.id && !signupsErrorByEventId[event.id] ? (
                        (signupsByEventId[event.id] ?? []).length > 0 ? (
                          <div className="partner-signups-list">
                            {(signupsByEventId[event.id] ?? []).map((signup) => (
                              <article key={signup.id} className="partner-signup-row">
                                <div>
                                  <p className="partner-signup-row__name">{signup.user_name}</p>
                                  <p className="muted">{signup.user_email}</p>
                                  {signup.user_phone ? <p className="muted">{signup.user_phone}</p> : null}
                                </div>
                                <div className="partner-signup-row__meta">
                                  <p className="muted">Submitted: {formatSubmissionDate(signup.submitted_at)}</p>
                                  <p className="muted">
                                    Paid: {signup.paid_amount_cents ? formatEventPaymentAmount(signup.paid_amount_cents) : "No payment"}
                                  </p>
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className="muted">No signups for this event yet.</p>
                        )
                      ) : null}
                    </div>
                  ) : null}
                  <div className="partner-event-card__payout">
                    <div>
                      <p className="partner-event-card__payout-title">Payouts</p>
                      <p className="muted">
                        Request a payout once this event has collected paid signups.
                      </p>
                    </div>
                    <button
                      className="button primary"
                      type="button"
                      onClick={() => void requestPayout(event)}
                      disabled={requestingPayoutId === event.id || (event.earned_amount_cents ?? 0) <= 0}
                    >
                      {requestingPayoutId === event.id ? "Sending..." : "Request Payout"}
                    </button>
                  </div>
                  {payoutStatuses[event.id]?.message ? (
                    <p
                      className={`form-help ${
                        payoutStatuses[event.id]?.type === "error"
                          ? "error"
                          : payoutStatuses[event.id]?.type === "success"
                            ? "success"
                            : "muted"
                      }`}
                    >
                      {payoutStatuses[event.id]?.message}
                    </p>
                  ) : null}
                  <div className="cta-row">
                    <button
                      className="button ghost"
                      type="button"
                      onClick={() => {
                        setEditingId(event.id);
                        setEditForm(mapEventToForm(event));
                        setFormStatus({ type: "idle" });
                      }}
                      disabled={savingEditId === event.id}
                    >
                      {editingId === event.id ? "Editing" : "Edit"}
                    </button>
                    <button
                      className="button ghost"
                      type="button"
                      onClick={() => void deleteEvent(event.id, event.title)}
                      disabled={deletingId === event.id}
                    >
                      {deletingId === event.id ? "Deleting..." : "Delete"}
                    </button>
                    {event.approval_status === "approved" ? (
                      <Link className="button ghost" href={`/events?eventId=${event.id}`}>
                        View Live Listing
                      </Link>
                    ) : null}
                  </div>
                  {editingId === event.id ? (
                    <div className="register-form" style={{ marginTop: 12 }}>
                      <PartnerEventFields
                        target="edit"
                        idPrefix={`edit-${event.id}`}
                        form={editForm}
                        sports={sports}
                        update={updateEditForm}
                        updateSportId={updateEditSportId}
                        updateRegistrationField={updateRegistrationField}
                        addRegistrationField={addRegistrationField}
                        toggleRegistrationFieldExpanded={toggleRegistrationFieldExpanded}
                        collapseRegistrationField={collapseRegistrationField}
                        removeRegistrationField={removeRegistrationField}
                        moveRegistrationField={moveRegistrationField}
                        uploadingImage={uploadingEditImageId === event.id}
                        uploadingFlyer={uploadingEditFlyerId === event.id}
                        uploadingWaiver={uploadingEditWaiverId === event.id}
                        onImageUpload={(e) => void handleEditImageUpload(event.id, e)}
                        onFlyerUpload={(e) => void handleEditFlyerUpload(event.id, e)}
                        onWaiverUpload={(e) => void handleEditWaiverUpload(event.id, e)}
                      />
                      <div className="cta-row">
                        <button
                          className="button primary"
                          type="button"
                          onClick={() => void submitEdit(event.id)}
                          disabled={savingEditId === event.id}
                        >
                          {savingEditId === event.id ? "Saving..." : "Save Changes"}
                        </button>
                        <button className="button ghost" type="button" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function PartnerEventFields({
  target,
  idPrefix,
  form,
  sports,
  update,
  updateSportId,
  updateRegistrationField,
  addRegistrationField,
  toggleRegistrationFieldExpanded,
  collapseRegistrationField,
  removeRegistrationField,
  moveRegistrationField,
  uploadingImage,
  uploadingFlyer,
  uploadingWaiver,
  onImageUpload,
  onFlyerUpload,
  onWaiverUpload,
}: {
  target: "create" | "edit";
  idPrefix: string;
  form: PartnerEventFormState;
  sports: Sport[];
  update: <K extends keyof PartnerEventFormState>(key: K, value: PartnerEventFormState[K]) => void;
  updateSportId: (sportId: string) => void;
  updateRegistrationField: (
    target: "create" | "edit",
    fieldId: string,
    key: keyof RegistrationFieldEditor,
    value: RegistrationFieldEditor[keyof RegistrationFieldEditor],
  ) => void;
  addRegistrationField: (target: "create" | "edit") => void;
  toggleRegistrationFieldExpanded: (target: "create" | "edit", fieldId: string) => void;
  collapseRegistrationField: (target: "create" | "edit", fieldId: string) => void;
  removeRegistrationField: (target: "create" | "edit", fieldId: string) => void;
  moveRegistrationField: (target: "create" | "edit", fieldId: string, direction: -1 | 1) => void;
  uploadingImage: boolean;
  uploadingFlyer: boolean;
  uploadingWaiver: boolean;
  onImageUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onFlyerUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onWaiverUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <>
      <div className="register-form-grid">
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-title`}>Event Name *</label>
          <input
            id={`${idPrefix}-partner-title`}
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            required
          />
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-start`}>Start date</label>
          <input
            id={`${idPrefix}-partner-start`}
            type="date"
            value={form.start_date}
            onChange={(e) => update("start_date", e.target.value)}
          />
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-end`}>End date</label>
          <input
            id={`${idPrefix}-partner-end`}
            type="date"
            value={form.end_date}
            onChange={(e) => update("end_date", e.target.value)}
          />
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-time`}>Time info</label>
          <input
            id={`${idPrefix}-partner-time`}
            value={form.time_info}
            onChange={(e) => update("time_info", e.target.value)}
            placeholder="8:00 AM tip-off"
          />
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-location`}>Location</label>
          <input
            id={`${idPrefix}-partner-location`}
            value={form.location}
            onChange={(e) => update("location", e.target.value)}
          />
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-sport`}>Sport page</label>
          <select
            id={`${idPrefix}-partner-sport`}
            value={form.sport_id}
            onChange={(e) => updateSportId(e.target.value)}
          >
            <option value="">Not linked to a sport page</option>
            {sports.map((sport) => (
              <option key={sport.id} value={sport.id}>
                {sport.title}
              </option>
            ))}
          </select>
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-program`}>Event type</label>
          <select
            id={`${idPrefix}-partner-program`}
            value={form.registration_program_slug}
            onChange={(e) => update("registration_program_slug", e.target.value)}
            disabled={!form.sport_id}
          >
            <option value="">{form.sport_id ? "Select an event type" : "Select a sport page first"}</option>
            {getEventProgramSlugOptions(sports.find((sport) => sport.id === form.sport_id) ?? null).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-limit`}>Registration limit</label>
          <input
            id={`${idPrefix}-partner-limit`}
            type="number"
            min="1"
            value={form.registration_limit}
            onChange={(e) => update("registration_limit", e.target.value)}
          />
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-payment`}>Payment amount (USD)</label>
          <input
            id={`${idPrefix}-partner-payment`}
            type="number"
            min="0.01"
            step="0.01"
            value={form.payment_amount}
            onChange={(e) => update("payment_amount", e.target.value)}
            placeholder={form.payment_required ? "25.00" : "Enable payment below to enter an amount"}
            disabled={!form.payment_required}
          />
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-image`}>Event Card Image</label>
          <input
            id={`${idPrefix}-partner-image`}
            value={form.image_url}
            onChange={(e) => update("image_url", e.target.value)}
          />
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label className="button ghost" htmlFor={`${idPrefix}-partner-image-upload`} style={{ padding: "0.45rem 0.75rem" }}>
              {uploadingImage ? "Uploading..." : "Upload an image manually"}
            </label>
            <input
              id={`${idPrefix}-partner-image-upload`}
              type="file"
              accept="image/*"
              onChange={onImageUpload}
              disabled={uploadingImage}
              style={{ display: "none" }}
            />
          </div>
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-flyer`}>Flyer Upload</label>
          <input
            id={`${idPrefix}-partner-flyer`}
            value={form.flyer_image_url}
            onChange={(e) => update("flyer_image_url", e.target.value)}
          />
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label className="button ghost" htmlFor={`${idPrefix}-partner-flyer-upload`} style={{ padding: "0.45rem 0.75rem" }}>
              {uploadingFlyer ? "Uploading..." : "Upload a flyer manually"}
            </label>
            <input
              id={`${idPrefix}-partner-flyer-upload`}
              type="file"
              accept="image/*"
              onChange={onFlyerUpload}
              disabled={uploadingFlyer}
              style={{ display: "none" }}
            />
          </div>
        </div>
        <div className="form-control">
          <label htmlFor={`${idPrefix}-partner-waiver`}>Waiver PDF URL</label>
          <input
            id={`${idPrefix}-partner-waiver`}
            value={form.waiver_url}
            onChange={(e) => update("waiver_url", e.target.value)}
            placeholder="https://..."
          />
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label className="button ghost" htmlFor={`${idPrefix}-partner-waiver-upload`} style={{ padding: "0.45rem 0.75rem" }}>
              {uploadingWaiver ? "Uploading..." : "Upload waiver PDF"}
            </label>
            <input
              id={`${idPrefix}-partner-waiver-upload`}
              type="file"
              accept=".pdf,application/pdf"
              onChange={onWaiverUpload}
              disabled={uploadingWaiver}
              style={{ display: "none" }}
            />
            {form.waiver_url ? (
              <a className="muted" href={form.waiver_url} target="_blank" rel="noreferrer">
                View waiver
              </a>
            ) : null}
          </div>
          <p className="form-help muted">Uploading a waiver PDF automatically enables waiver acceptance during signup.</p>
        </div>
        <div className="form-control" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor={`${idPrefix}-partner-flyer-details`}>Details</label>
          <textarea
            id={`${idPrefix}-partner-flyer-details`}
            value={form.flyer_details}
            onChange={(e) => update("flyer_details", e.target.value)}
            rows={4}
            placeholder="Optional extra event details for the flyer modal."
          />
        </div>
      </div>
      <div className="form-control checkbox-control" style={{ justifySelf: "start", textAlign: "left", width: "fit-content" }}>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.payment_required}
            onChange={(e) => update("payment_required", e.target.checked)}
          />
          <span>Require payment before registration is created</span>
        </label>
      </div>
      <div className="form-control checkbox-control" style={{ justifySelf: "start", textAlign: "left", width: "fit-content" }}>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.require_waiver}
            onChange={(e) => update("require_waiver", e.target.checked)}
          />
          <span>Require waiver acceptance during signup</span>
        </label>
      </div>
      <div style={{ display: "grid", gap: 16 }}>
        <div className="account-card__header">
          <div>
            <h3 style={{ margin: 0 }}>Extra Form Fields</h3>
            <p className="muted" style={{ margin: 0 }}>
              Name, email, and phone are always included automatically.
            </p>
          </div>
          <button className="button ghost" type="button" onClick={() => addRegistrationField(target)}>
            Add field
          </button>
        </div>
        {form.registration_fields.length === 0 ? (
          <p className="muted">No extra fields yet.</p>
        ) : (
          form.registration_fields.map((field, index) => (
            <div
              key={field.id}
              style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, display: "grid", gap: 12 }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <p className="list__title" style={{ margin: 0 }}>
                    {field.label.trim() || `Field ${index + 1}`}
                  </p>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    {field.type}
                    {field.required ? " • required" : ""}
                  </p>
                </div>
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => toggleRegistrationFieldExpanded(target, field.id)}
                >
                  {field.expanded ? "Collapse" : "Edit"}
                </button>
              </div>

              {field.expanded ? (
                <>
                  <div className="register-form-grid">
                    <div className="form-control">
                      <label htmlFor={`${idPrefix}-field-label-${field.id}`}>Field label</label>
                      <input
                        id={`${idPrefix}-field-label-${field.id}`}
                        value={field.label}
                        onChange={(e) => updateRegistrationField(target, field.id, "label", e.target.value)}
                        placeholder="T-shirt size"
                      />
                    </div>
                    <div className="form-control">
                      <label htmlFor={`${idPrefix}-field-placeholder-${field.id}`}>Placeholder</label>
                      <input
                        id={`${idPrefix}-field-placeholder-${field.id}`}
                        value={field.placeholder}
                        onChange={(e) => updateRegistrationField(target, field.id, "placeholder", e.target.value)}
                        placeholder="Optional helper text"
                      />
                    </div>
                    <div className="form-control">
                      <label htmlFor={`${idPrefix}-field-type-${field.id}`}>Field type</label>
                      <select
                        id={`${idPrefix}-field-type-${field.id}`}
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
                      <label htmlFor={`${idPrefix}-field-options-${field.id}`}>Options</label>
                      <textarea
                        id={`${idPrefix}-field-options-${field.id}`}
                        value={field.optionsText}
                        onChange={(e) => updateRegistrationField(target, field.id, "optionsText", e.target.value)}
                        rows={4}
                        placeholder={"Small\nMedium\nLarge"}
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
                  disabled={index === form.registration_fields.length - 1}
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
    </>
  );
}
