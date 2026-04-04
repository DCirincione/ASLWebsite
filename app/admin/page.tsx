"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";

import { AccessibilityControls } from "@/components/accessibility-controls";
import { HistoryBackButton } from "@/components/history-back-button";
import { SubmissionReviewModal } from "@/components/submission-review-modal";
import { INBOX_ANNOUNCEMENT_AUDIENCE_OPTIONS, type InboxAnnouncementAudience } from "@/lib/inbox";
import {
  ALDRICH_COMMUNICATIONS_KEY,
  ALDRICH_COMMUNICATIONS_LABEL,
  parseAldrichCommunicationsPreferenceFromMessage,
} from "@/lib/aldrich-communications";
import { canAccessAdminDashboard, formatApprovalStatusLabel } from "@/lib/event-approval";
import { createId } from "@/lib/create-id";
import { formatEventPaymentAmount } from "@/lib/event-payments";
import type { SignupMode } from "@/lib/event-signups";
import { DEFAULT_HOME_BANNER_TEXT, HOME_BANNER_PAGE_OPTIONS, type HomeBannerButtonTarget } from "@/lib/home-banner";
import {
  buildSundayLeagueSignupForm,
  createEmptySundayLeagueSignupFieldEditor,
  parseSundayLeagueSignupEditorFields,
  SUNDAY_LEAGUE_SIGNUP_FIELD_TYPE_OPTIONS,
  type SundayLeagueSignupFieldEditor,
  type SundayLeagueSignupFieldType,
} from "@/lib/sunday-league-signup-form";
import { DEFAULT_SUNDAY_LEAGUE_DEPOSIT_AMOUNT_CENTS, formatSundayLeagueDepositAmount } from "@/lib/sunday-league-settings-shared";
import { getEventProgramSlugOptions, parseSportSectionHeaders, slugifySportValue } from "@/lib/sports";
import { supabase } from "@/lib/supabase/client";
import type {
  Event,
  Flyer,
  JsonValue,
  Sport,
  SundayLeagueScheduleWeek,
  SundayLeagueTeam,
  SundayLeagueTeamCheckoutDraft,
} from "@/lib/supabase/types";

type AccessStatus = "loading" | "allowed" | "no-session" | "forbidden";
type FormStatus = { type: "idle" | "loading" | "success" | "error"; message?: string };
type AdminModule =
  | "none"
  | "events"
  | "sundayLeague"
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
  sport_id: string;
  registration_enabled: boolean;
  waiver_url: string;
  registration_limit: string;
  payment_required: boolean;
  payment_amount: string;
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
type SundayLeagueScheduleFormState = {
  blackSheepField: string;
  magicFountainField: string;
};
type CommunityArticle = {
  id: string;
  title: string;
  blurb: string;
  href: string;
  date?: string;
  image?: string;
};
type CommunitySponsorPlacement = "standard" | "top";
type CommunitySponsor = {
  id: string;
  name: string;
  description: string;
  image: string;
  placement: CommunitySponsorPlacement;
  websiteUrl?: string;
  instagramUrl?: string;
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
  paid_amount_cents?: number | null;
  type_label: string;
  registration_name?: string | null;
};
type ContactMessage = {
  id: string;
  name: string;
  email: string;
  message: string;
  communications_opt_in?: boolean | null;
  is_read?: boolean | null;
  read_at?: string | null;
  created_at?: string | null;
};
type UserDirectoryRecord = {
  id: string;
  name: string;
  role?: "player" | "partner" | "admin" | "owner" | null;
  age?: string | null;
  sports?: string[] | null;
  suspended?: boolean | null;
  suspended_at?: string | null;
  suspension_reason?: string | null;
  created_at?: string | null;
};
type UserRole = "player" | "partner" | "admin" | "owner";
type UserManageForm = {
  role: UserRole;
  status: "active" | "suspended";
  reason: string;
};
type ContactFilter = "all" | "unread" | "read";
type AnnouncementFormState = {
  audience: InboxAnnouncementAudience;
  title: string;
  message: string;
  recipientIds: string[];
};

const isJsonRecord = (value: unknown): value is Record<string, JsonValue | undefined> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getJsonRecord = (value: JsonValue | null | undefined) => (isJsonRecord(value) ? value : null);

const appendSundayLeagueAnswer = (
  answers: Record<string, JsonValue | undefined>,
  label: string,
  value: JsonValue | undefined | null
) => {
  if (value == null) return;
  if (typeof value === "string" && !value.trim()) return;
  if (Array.isArray(value) && value.length === 0) return;
  answers[label] = value;
};

const normalizeMatchValue = (value?: string | null) => value?.trim().toLowerCase() || "";

const getRecordTimestamp = (value?: string | null) => {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getSundayLeagueDraftMatchScore = (
  team: SundayLeagueTeam,
  draft: Pick<SundayLeagueTeamCheckoutDraft, "team_id" | "user_id" | "division" | "slot_number" | "team_payload">
) => {
  if (draft.team_id === team.id) return 1000;

  const payload = getJsonRecord((draft.team_payload as JsonValue | undefined) ?? null);
  const payloadTeamName = normalizeMatchValue(typeof payload?.team_name === "string" ? payload.team_name : null);
  const payloadCaptainEmail = normalizeMatchValue(typeof payload?.captain_email === "string" ? payload.captain_email : null);
  const payloadCaptainPhone = normalizeMatchValue(typeof payload?.captain_phone === "string" ? payload.captain_phone : null);
  const payloadCaptainName = normalizeMatchValue(typeof payload?.captain_name === "string" ? payload.captain_name : null);

  const teamName = normalizeMatchValue(team.team_name);
  const captainEmail = normalizeMatchValue(team.captain_email);
  const captainPhone = normalizeMatchValue(team.captain_phone);
  const captainName = normalizeMatchValue(team.captain_name);

  const sameUser = draft.user_id === team.user_id;
  const sameDivision = draft.division === team.division;
  const sameSlot = draft.slot_number === team.slot_number;
  const sameTeamName = payloadTeamName && payloadTeamName === teamName;
  const sameCaptainEmail = payloadCaptainEmail && payloadCaptainEmail === captainEmail;
  const sameCaptainPhone = payloadCaptainPhone && payloadCaptainPhone === captainPhone;
  const sameCaptainName = payloadCaptainName && payloadCaptainName === captainName;

  if (sameUser && sameDivision && sameSlot) return 950;
  if (sameDivision && sameSlot && sameTeamName && sameCaptainEmail) return 900;
  if (sameDivision && sameTeamName && sameCaptainEmail) return 850;
  if (sameUser && sameTeamName && sameCaptainEmail) return 825;
  if (sameDivision && sameSlot && sameTeamName && sameCaptainPhone) return 800;
  if (sameDivision && sameSlot && sameCaptainEmail) return 775;
  if (sameDivision && sameTeamName && sameCaptainName) return 750;
  if (sameUser && sameDivision && sameTeamName) return 725;
  if (sameUser && sameDivision && sameCaptainEmail) return 700;

  return -1;
};

const getBestSundayLeagueCheckoutDraft = ({
  team,
  drafts,
  configuredDepositAmountCents,
}: {
  team: SundayLeagueTeam;
  drafts: Array<
    Pick<
      SundayLeagueTeamCheckoutDraft,
      "team_id" | "user_id" | "division" | "slot_number" | "team_payload" | "amount_cents" | "updated_at" | "created_at"
    >
  >;
  configuredDepositAmountCents: number;
}) => {
  const matches = drafts
    .map((draft) => ({
      draft,
      score: getSundayLeagueDraftMatchScore(team, draft),
      timestamp: Math.max(getRecordTimestamp(draft.updated_at), getRecordTimestamp(draft.created_at)),
    }))
    .filter((entry) => entry.score >= 0);

  if (matches.length === 0) return null;

  const bestScore = Math.max(...matches.map((entry) => entry.score));
  const bestScoreMatches = matches.filter((entry) => entry.score === bestScore);
  const amountCounts = new Map<number, number>();
  for (const entry of bestScoreMatches) {
    amountCounts.set(entry.draft.amount_cents, (amountCounts.get(entry.draft.amount_cents) ?? 0) + 1);
  }

  return bestScoreMatches.sort((a, b) => {
    const aCount = amountCounts.get(a.draft.amount_cents) ?? 0;
    const bCount = amountCounts.get(b.draft.amount_cents) ?? 0;
    if (aCount !== bCount) return bCount - aCount;

    const aMatchesConfigured = a.draft.amount_cents === configuredDepositAmountCents ? 1 : 0;
    const bMatchesConfigured = b.draft.amount_cents === configuredDepositAmountCents ? 1 : 0;
    if (aMatchesConfigured !== bMatchesConfigured) return bMatchesConfigured - aMatchesConfigured;

    if (a.draft.amount_cents !== b.draft.amount_cents) return b.draft.amount_cents - a.draft.amount_cents;

    return b.timestamp - a.timestamp;
  })[0]?.draft ?? null;
};

const collectSundayLeagueAttachments = (team: SundayLeagueTeam, teamPayload: Record<string, JsonValue | undefined> | null) => {
  const attachments = new Set<string>();
  if (team.team_logo_url?.trim()) {
    attachments.add(team.team_logo_url.trim());
  }

  const agreements = getJsonRecord((teamPayload?.agreements as JsonValue | undefined) ?? team.agreements ?? null);
  const customFields = getJsonRecord((agreements?.custom_fields as JsonValue | undefined) ?? null);
  for (const value of Object.values(customFields ?? {})) {
    if (typeof value === "string" && value.trim().includes("/")) {
      attachments.add(value.trim());
    }
  }

  return Array.from(attachments);
};

const buildSundayLeagueRegistrationAnswers = (
  team: SundayLeagueTeam,
  teamPayload: Record<string, JsonValue | undefined> | null
): Record<string, JsonValue | undefined> => {
  const answers: Record<string, JsonValue | undefined> = {};
  const preferredColors = getJsonRecord((team.preferred_jersey_colors as JsonValue | undefined) ?? null);
  const agreements = getJsonRecord((teamPayload?.agreements as JsonValue | undefined) ?? team.agreements ?? null);
  const customFields = getJsonRecord((agreements?.custom_fields as JsonValue | undefined) ?? null);

  appendSundayLeagueAnswer(answers, "Division", `Division ${team.division}`);
  appendSundayLeagueAnswer(answers, "Slot Number", team.slot_number);
  appendSundayLeagueAnswer(answers, "Team Name", team.team_name);
  appendSundayLeagueAnswer(answers, "Captain Name", team.captain_name);
  appendSundayLeagueAnswer(answers, "Captain Email", team.captain_email);
  appendSundayLeagueAnswer(answers, "Captain Phone", team.captain_phone);
  appendSundayLeagueAnswer(answers, "Captain Is Playing", Boolean(team.captain_is_playing));
  appendSundayLeagueAnswer(answers, "Primary Color", preferredColors?.primary);
  appendSundayLeagueAnswer(answers, "Secondary Color", preferredColors?.secondary);
  appendSundayLeagueAnswer(answers, "Accent Color", preferredColors?.accent);
  appendSundayLeagueAnswer(answers, "Preferred Jersey Design", team.preferred_jersey_design);
  appendSundayLeagueAnswer(answers, "Logo Description", team.logo_description);
  appendSundayLeagueAnswer(answers, "Jersey Numbers", team.jersey_numbers ?? null);
  appendSundayLeagueAnswer(answers, "Deposit Status", team.deposit_status ?? null);
  appendSundayLeagueAnswer(answers, "Team Status", team.team_status ?? null);

  if (agreements) {
    appendSundayLeagueAnswer(answers, "Captain Confirmed", agreements.captain_confirmed);
    appendSundayLeagueAnswer(answers, "Deposit Required", agreements.deposit_required);
    appendSundayLeagueAnswer(answers, "Balance Due", agreements.balance_due);
    appendSundayLeagueAnswer(answers, "Approval Not Guaranteed", agreements.approval_not_guaranteed);
    appendSundayLeagueAnswer(answers, "Rules Accepted", agreements.rules_accepted);
    appendSundayLeagueAnswer(answers, ALDRICH_COMMUNICATIONS_LABEL, agreements[ALDRICH_COMMUNICATIONS_KEY]);
  }

  for (const [key, value] of Object.entries(customFields ?? {})) {
    appendSundayLeagueAnswer(answers, key, value);
  }

  return answers;
};

const FLYER_BUCKET = "flyers";
const COMMUNITY_SPONSOR_PLACEMENT_OPTIONS: CommunitySponsorPlacement[] = ["standard", "top"];
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

const normalizeContactMessage = (message: ContactMessage): ContactMessage => {
  const parsed = parseAldrichCommunicationsPreferenceFromMessage(message.message);
  return {
    ...message,
    message: parsed.message,
    communications_opt_in: parsed.optedIn,
  };
};

const createEmptySundayLeagueScheduleForm = (): SundayLeagueScheduleFormState => ({
  blackSheepField: "",
  magicFountainField: "",
});

const mapSportToForm = (sport: Sport): SportFormState => ({
  title: sport.title ?? "",
  players_per_team: sport.players_per_team?.toString() ?? "",
  gender: sport.gender ?? "open",
  short_description: sport.short_description ?? "",
  section_headers: parseSportSectionHeaders(sport.section_headers).join("\n"),
  image_url: sport.image_url ?? "",
});

const createEmptyAnnouncementForm = (): AnnouncementFormState => ({
  audience: "all_players",
  title: "",
  message: "",
  recipientIds: [],
});

export default function AdminPage() {
  const [status, setStatus] = useState<AccessStatus>("loading");
  const [activeModule, setActiveModule] = useState<AdminModule>("none");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [eventOwnerNames, setEventOwnerNames] = useState<Record<string, string>>({});
  const [sports, setSports] = useState<Sport[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingSports, setLoadingSports] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingSportId, setDeletingSportId] = useState<string | null>(null);
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [savingPartnerApprovalId, setSavingPartnerApprovalId] = useState<string | null>(null);
  const [savingSportEditId, setSavingSportEditId] = useState<string | null>(null);
  const [uploadingCreateImage, setUploadingCreateImage] = useState(false);
  const [uploadingEditImageId, setUploadingEditImageId] = useState<string | null>(null);
  const [uploadingCreateSportImage, setUploadingCreateSportImage] = useState(false);
  const [uploadingEditSportImageId, setUploadingEditSportImageId] = useState<string | null>(null);
  const [uploadingCreateSponsorImage, setUploadingCreateSponsorImage] = useState(false);
  const [uploadingEditSponsorImageId, setUploadingEditSponsorImageId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSportId, setEditingSportId] = useState<string | null>(null);
  const [showCreateEventForm, setShowCreateEventForm] = useState(false);
  const [showExistingEvents, setShowExistingEvents] = useState(false);
  const [showPartnerRequests, setShowPartnerRequests] = useState(false);
  const [showCreateSportForm, setShowCreateSportForm] = useState(false);
  const [showCreateArticleForm, setShowCreateArticleForm] = useState(false);
  const [showCreateSponsorForm, setShowCreateSponsorForm] = useState(false);
  const [showCommunityContentForm, setShowCommunityContentForm] = useState(false);
  const [formStatus, setFormStatus] = useState<FormStatus>({ type: "idle" });
  const [sportsStatus, setSportsStatus] = useState<FormStatus>({ type: "idle" });
  const [communityStatus, setCommunityStatus] = useState<FormStatus>({ type: "idle" });
  const [communityContentStatus, setCommunityContentStatus] = useState<FormStatus>({ type: "idle" });
  const [communitySponsorsStatus, setCommunitySponsorsStatus] = useState<FormStatus>({ type: "idle" });
  const [siteSettingsStatus, setSiteSettingsStatus] = useState<FormStatus>({ type: "idle" });
  const [announcementStatus, setAnnouncementStatus] = useState<FormStatus>({ type: "idle" });
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [partnerApprovalNotes, setPartnerApprovalNotes] = useState<Record<string, string>>({});
  const [sportsError, setSportsError] = useState<string | null>(null);
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [loadingFlyers, setLoadingFlyers] = useState(false);
  const [flyersError, setFlyersError] = useState<string | null>(null);
  const [flyersStatus, setFlyersStatus] = useState<FormStatus>({ type: "idle" });
  const [scheduleWeeks, setScheduleWeeks] = useState<SundayLeagueScheduleWeek[]>([]);
  const [loadingScheduleWeeks, setLoadingScheduleWeeks] = useState(false);
  const [scheduleWeeksError, setScheduleWeeksError] = useState<string | null>(null);
  const [scheduleWeeksStatus, setScheduleWeeksStatus] = useState<FormStatus>({ type: "idle" });
  const [sundayLeagueSignupStatus, setSundayLeagueSignupStatus] = useState<FormStatus>({ type: "idle" });
  const [sundayLeagueSettingsStatus, setSundayLeagueSettingsStatus] = useState<FormStatus>({ type: "idle" });
  const [loadingSundayLeagueSignupForm, setLoadingSundayLeagueSignupForm] = useState(false);
  const [loadingSundayLeagueSettings, setLoadingSundayLeagueSettings] = useState(false);
  const [sundayLeagueSignupFieldsVisible, setSundayLeagueSignupFieldsVisible] = useState(false);
  const [sundayLeagueSignupFields, setSundayLeagueSignupFields] = useState<SundayLeagueSignupFieldEditor[]>([]);
  const [sundayLeagueSettingsForm, setSundayLeagueSettingsForm] = useState({
    depositAmount: (DEFAULT_SUNDAY_LEAGUE_DEPOSIT_AMOUNT_CENTS / 100).toFixed(2),
  });
  const [showCreateScheduleWeekForm, setShowCreateScheduleWeekForm] = useState(false);
  const [scheduleWeekForm, setScheduleWeekForm] = useState<SundayLeagueScheduleFormState>(createEmptySundayLeagueScheduleForm());
  const [editingScheduleWeekId, setEditingScheduleWeekId] = useState<string | null>(null);
  const [editScheduleWeekForm, setEditScheduleWeekForm] = useState<SundayLeagueScheduleFormState>(createEmptySundayLeagueScheduleForm());
  const [savingScheduleWeekId, setSavingScheduleWeekId] = useState<string | null>(null);
  const [deletingScheduleWeekId, setDeletingScheduleWeekId] = useState<string | null>(null);
  const [expandedScheduleWeekCards, setExpandedScheduleWeekCards] = useState<Record<string, boolean>>({});
  const [uploadingFlyerEventId, setUploadingFlyerEventId] = useState<string | null>(null);
  const [savingFlyerEventId, setSavingFlyerEventId] = useState<string | null>(null);
  const [deletingFlyerEventId, setDeletingFlyerEventId] = useState<string | null>(null);
  const [flyerDetailsDrafts, setFlyerDetailsDrafts] = useState<Record<string, string>>({});
  const [expandedFlyerPreviews, setExpandedFlyerPreviews] = useState<Record<string, boolean>>({});
  const [communityArticles, setCommunityArticles] = useState<CommunityArticle[]>([]);
  const [loadingCommunity, setLoadingCommunity] = useState(false);
  const [communitySponsors, setCommunitySponsors] = useState<CommunitySponsor[]>([]);
  const [loadingCommunitySponsors, setLoadingCommunitySponsors] = useState(false);
  const [loadingSiteSettings, setLoadingSiteSettings] = useState(false);
  const [expandedCommunitySponsorCards, setExpandedCommunitySponsorCards] = useState<Record<string, boolean>>({});
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
  const [editingSponsorId, setEditingSponsorId] = useState<string | null>(null);
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
  const [communitySponsorForm, setCommunitySponsorForm] = useState({
    name: "",
    description: "",
    image: "",
    placement: "standard" as CommunitySponsorPlacement,
    websiteUrl: "",
    instagramUrl: "",
  });
  const [communitySponsorEditForm, setCommunitySponsorEditForm] = useState({
    name: "",
    description: "",
    image: "",
    placement: "standard" as CommunitySponsorPlacement,
    websiteUrl: "",
    instagramUrl: "",
  });
  const [communityContentForm, setCommunityContentForm] = useState({
    boardTitle: "",
    body: "",
  });
  const [siteSettingsForm, setSiteSettingsForm] = useState({
    homeBannerEnabled: true,
    homeBannerText: DEFAULT_HOME_BANNER_TEXT,
    homeBannerButtonTarget: "none" as HomeBannerButtonTarget,
    homeBannerButtonEventId: "",
    homeBannerButtonPageHref: "",
  });
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementFormState>(createEmptyAnnouncementForm());
  const [announcementRecipientSearch, setAnnouncementRecipientSearch] = useState("");
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
    sport_id: "",
    registration_enabled: false,
    waiver_url: "",
    registration_limit: "",
    payment_required: false,
    payment_amount: "",
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
    sport_id: "",
    registration_enabled: false,
    waiver_url: "",
    registration_limit: "",
    payment_required: false,
    payment_amount: "",
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
      id: "sundayLeague",
      title: "Sunday League",
      description: "Manage the Sunday League signup form and post weekly schedule text for both fields.",
      enabled: true,
    },
    {
      id: "community",
      title: "Community",
      description: "Manage community intro copy, sponsor shout-outs, and featured articles.",
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
      enabled: true,
    },
  ];

  const loadEvents = async () => {
    if (!supabase) return;
    setLoadingEvents(true);
    setEventsError(null);
    const { data, error } = await supabase
      .from("events")
      .select("id,title,start_date,end_date,time_info,location,description,host_type,image_url,signup_mode,registration_program_slug,sport_id,registration_enabled,waiver_url,allow_multiple_registrations,registration_limit,registration_schema,payment_required,payment_amount_cents,created_by_user_id,approved_by_user_id,approval_status,approval_notes,submitted_for_approval_at,approved_at")
      .order("start_date", { ascending: true, nullsFirst: false });

    if (!error && data) {
      setEvents(data as Event[]);
      const ownerIds = Array.from(
        new Set((data as Event[]).map((event) => event.created_by_user_id).filter((value): value is string => Boolean(value)))
      );
      const nextPartnerApprovalNotes: Record<string, string> = {};
      for (const event of data as Event[]) {
        nextPartnerApprovalNotes[event.id] = event.approval_notes ?? "";
      }
      setPartnerApprovalNotes(nextPartnerApprovalNotes);

      if (ownerIds.length > 0) {
        const { data: ownerProfiles } = await supabase.from("profiles").select("id,name").in("id", ownerIds);
        const nextOwnerNames: Record<string, string> = {};
        for (const ownerProfile of ownerProfiles ?? []) {
          nextOwnerNames[ownerProfile.id] = ownerProfile.name ?? "Partner";
        }
        setEventOwnerNames(nextOwnerNames);
      } else {
        setEventOwnerNames({});
      }
    } else {
      setEvents([]);
      setEventOwnerNames({});
      setPartnerApprovalNotes({});
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

  const loadScheduleWeeks = async () => {
    if (!supabase) return;
    setLoadingScheduleWeeks(true);
    setScheduleWeeksError(null);
    setExpandedScheduleWeekCards({});

    const { data, error } = await supabase
      .from("sunday_league_schedule_weeks")
      .select("*")
      .order("week_number", { ascending: true });

    if (error) {
      setScheduleWeeks([]);
      setScheduleWeeksError(error.message ?? "Could not load Sunday League schedule.");
    } else {
      setScheduleWeeks((data ?? []) as SundayLeagueScheduleWeek[]);
    }

    setLoadingScheduleWeeks(false);
  };

  const loadSundayLeagueSignupForm = async () => {
    setLoadingSundayLeagueSignupForm(true);
    setSundayLeagueSignupStatus({ type: "idle" });
    setSundayLeagueSignupFieldsVisible(false);

    try {
      const response = await fetch("/api/admin/sunday-league-signup-form");
      const json = await response.json();

      if (!response.ok) {
        setSundayLeagueSignupStatus({ type: "error", message: json?.error ?? "Could not load the Sunday League signup form." });
        return;
      }

      setSundayLeagueSignupFields(parseSundayLeagueSignupEditorFields(json?.form));
    } catch {
      setSundayLeagueSignupStatus({ type: "error", message: "Could not load the Sunday League signup form." });
    } finally {
      setLoadingSundayLeagueSignupForm(false);
    }
  };

  const loadSundayLeagueSettings = async () => {
    setLoadingSundayLeagueSettings(true);
    setSundayLeagueSettingsStatus({ type: "idle" });

    try {
      const response = await fetch("/api/admin/sunday-league-settings");
      const json = await response.json();

      if (!response.ok) {
        setSundayLeagueSettingsStatus({ type: "error", message: json?.error ?? "Could not load Sunday League deposit settings." });
        return;
      }

      const depositAmountCents =
        typeof json?.settings?.depositAmountCents === "number"
          ? json.settings.depositAmountCents
          : DEFAULT_SUNDAY_LEAGUE_DEPOSIT_AMOUNT_CENTS;

      setSundayLeagueSettingsForm({
        depositAmount: (depositAmountCents / 100).toFixed(2),
      });
    } catch {
      setSundayLeagueSettingsStatus({ type: "error", message: "Could not load Sunday League deposit settings." });
    } finally {
      setLoadingSundayLeagueSettings(false);
    }
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

  const loadCommunitySponsors = async () => {
    setLoadingCommunitySponsors(true);
    setCommunitySponsorsStatus({ type: "idle" });
    try {
      const response = await fetch("/api/admin/community-sponsors");
      const json = await response.json();
      if (!response.ok) {
        setCommunitySponsorsStatus({ type: "error", message: json?.error ?? "Could not load community sponsors." });
        setCommunitySponsors([]);
      } else {
        setCommunitySponsors((json?.sponsors ?? []) as CommunitySponsor[]);
      }
    } catch {
      setCommunitySponsorsStatus({ type: "error", message: "Could not load community sponsors." });
      setCommunitySponsors([]);
    } finally {
      setLoadingCommunitySponsors(false);
    }
  };

  const loadSiteSettings = async () => {
    setLoadingSiteSettings(true);
    setSiteSettingsStatus({ type: "idle" });
    try {
      const response = await fetch("/api/admin/site-settings");
      const json = await response.json();
      if (!response.ok) {
        setSiteSettingsStatus({ type: "error", message: json?.error ?? "Could not load site settings." });
        return;
      }

      const settings = (json?.settings ?? {}) as {
        homeBanner?: {
          enabled?: boolean;
          text?: string;
          buttonTarget?: HomeBannerButtonTarget;
          buttonEventId?: string;
          buttonPageHref?: string;
        };
      };

      setSiteSettingsForm({
        homeBannerEnabled: Boolean(settings.homeBanner?.enabled),
        homeBannerText:
          typeof settings.homeBanner?.text === "string"
            ? settings.homeBanner.text
            : DEFAULT_HOME_BANNER_TEXT,
        homeBannerButtonTarget: settings.homeBanner?.buttonTarget === "event" || settings.homeBanner?.buttonTarget === "page"
          ? settings.homeBanner.buttonTarget
          : "none",
        homeBannerButtonEventId:
          typeof settings.homeBanner?.buttonEventId === "string"
            ? settings.homeBanner.buttonEventId
            : "",
        homeBannerButtonPageHref:
          typeof settings.homeBanner?.buttonPageHref === "string"
            ? settings.homeBanner.buttonPageHref
            : "",
      });
    } catch {
      setSiteSettingsStatus({ type: "error", message: "Could not load site settings." });
    } finally {
      setLoadingSiteSettings(false);
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
        setContactMessages(((legacyQuery.data ?? []) as ContactMessage[]).map(normalizeContactMessage));
      }
    } else if (fullQuery.error) {
      setContactMessages([]);
      setContactMessagesError(fullQuery.error.message ?? "Could not load contact messages.");
    } else {
      setContactMessages(((fullQuery.data ?? []) as ContactMessage[]).map(normalizeContactMessage));
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
    const configuredSundayLeagueDepositAmountCents = Math.round(Number(sundayLeagueSettingsForm.depositAmount) * 100);
    const sundayLeagueDepositAmountCents =
      Number.isFinite(configuredSundayLeagueDepositAmountCents) && configuredSundayLeagueDepositAmountCents > 0
        ? configuredSundayLeagueDepositAmountCents
        : DEFAULT_SUNDAY_LEAGUE_DEPOSIT_AMOUNT_CENTS;

    const [{ data: submissionData, error: submissionError }, { data: sundayLeagueTeamsData, error: sundayLeagueTeamsError }] =
      await Promise.all([
        supabase
          .from("event_submissions")
          .select("id,event_id,user_id,name,email,phone,answers,attachments,waiver_accepted,created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("sunday_league_teams")
          .select(
            "id,user_id,division,slot_number,captain_name,captain_phone,captain_email,captain_is_playing,team_name,preferred_jersey_colors,preferred_jersey_design,team_logo_url,logo_description,jersey_numbers,agreements,deposit_status,team_status,created_at"
          )
          .order("created_at", { ascending: false }),
      ]);

    if (submissionError || sundayLeagueTeamsError) {
      setRegistrations([]);
      setRegistrationsError(submissionError?.message ?? sundayLeagueTeamsError?.message ?? "Could not load registrations.");
      setLoadingRegistrations(false);
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setRegistrations([]);
      setRegistrationsError("Sign in again to continue.");
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
    const sundayLeagueTeams = (sundayLeagueTeamsData ?? []) as Array<SundayLeagueTeam>;

    if (submissions.length === 0 && sundayLeagueTeams.length === 0) {
      setRegistrations([]);
      setSelectedRegistrationEventId(null);
      setLoadingRegistrations(false);
      return;
    }

    const userIds = Array.from(
      new Set([...submissions.map((row) => row.user_id), ...sundayLeagueTeams.map((row) => row.user_id)].filter(Boolean))
    );

    const [
      { data: eventsData, error: eventsError },
      { data: profilesData, error: profilesError },
      registrationPaymentsResponse,
    ] =
      await Promise.all([
        supabase
          .from("events")
          .select("id,title,signup_mode")
          .in("id", Array.from(new Set(submissions.map((row) => row.event_id).filter(Boolean)))),
        supabase
          .from("profiles")
          .select("id,name")
          .in("id", userIds),
        fetch("/api/admin/registration-payments", {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        }),
      ]);

    const registrationPaymentsJson = (await registrationPaymentsResponse.json().catch(() => null)) as
      | {
          error?: string;
          eventDrafts?: Array<{
            submission_id?: string | null;
            amount_cents?: number | null;
            status?: "pending" | "paid" | "completed" | "failed" | "expired" | null;
            updated_at?: string | null;
            created_at?: string | null;
          }>;
          sundayLeagueDrafts?: Array<{
            team_id?: string | null;
            user_id?: string | null;
            division?: 1 | 2 | null;
            slot_number?: number | null;
            team_payload?: JsonValue | null;
            amount_cents?: number | null;
            status?: "pending" | "paid" | "completed" | "failed" | "expired" | null;
            updated_at?: string | null;
            created_at?: string | null;
          }>;
        }
      | null;

    if (eventsError || profilesError || !registrationPaymentsResponse.ok) {
      setRegistrations([]);
      setRegistrationsError(
        eventsError?.message ||
          profilesError?.message ||
          registrationPaymentsJson?.error ||
          "Could not load registrations."
      );
      setLoadingRegistrations(false);
      return;
    }

    const profiles = (profilesData ?? []) as Array<{ id: string; name: string | null }>;
    const profileById = new Map(profiles.map((row) => [row.id, row]));
    const eventById = new Map(
      ((eventsData ?? []) as Array<{ id: string; title: string; signup_mode?: SignupMode | null }>).map((row) => [row.id, row])
    );
    const paidCheckoutDraftBySubmissionId = new Map<string, { amount_cents: number; updated_at?: string | null; created_at?: string | null }>();
    const paidSundayLeagueCheckoutDrafts = [] as Array<
      Pick<
        SundayLeagueTeamCheckoutDraft,
        "team_id" | "user_id" | "division" | "slot_number" | "team_payload" | "amount_cents" | "updated_at" | "created_at"
      >
    >;

    for (const row of (registrationPaymentsJson?.eventDrafts ?? []) as Array<{
      submission_id?: string | null;
      amount_cents?: number | null;
      status?: "pending" | "paid" | "completed" | "failed" | "expired" | null;
      updated_at?: string | null;
      created_at?: string | null;
    }>) {
      if (!row.submission_id || !row.amount_cents || row.amount_cents <= 0) continue;
      if (row.status !== "completed" && row.status !== "paid") continue;

      const existing = paidCheckoutDraftBySubmissionId.get(row.submission_id);
      const rowTimestamp = row.updated_at ?? row.created_at ?? "";
      const existingTimestamp = existing?.updated_at ?? existing?.created_at ?? "";
      if (!existing || rowTimestamp >= existingTimestamp) {
        paidCheckoutDraftBySubmissionId.set(row.submission_id, {
          amount_cents: row.amount_cents,
          updated_at: row.updated_at ?? null,
          created_at: row.created_at ?? null,
        });
      }
    }

    for (const row of (registrationPaymentsJson?.sundayLeagueDrafts ?? []) as Array<{
      team_id?: string | null;
      user_id?: string | null;
      division?: 1 | 2 | null;
      slot_number?: number | null;
      team_payload?: JsonValue | null;
      amount_cents?: number | null;
      status?: "pending" | "paid" | "completed" | "failed" | "expired" | null;
      updated_at?: string | null;
      created_at?: string | null;
    }>) {
      if (!row.amount_cents || row.amount_cents <= 0) continue;
      if (row.status !== "completed" && row.status !== "paid") continue;
      paidSundayLeagueCheckoutDrafts.push({
        team_id: row.team_id ?? null,
        user_id: row.user_id ?? "",
        division: row.division ?? 1,
        slot_number: row.slot_number ?? 0,
        team_payload: row.team_payload ?? null,
        amount_cents: row.amount_cents,
        updated_at: row.updated_at ?? null,
        created_at: row.created_at ?? null,
      });
    }

    const eventRegistrations: RegistrationRecord[] = submissions.map((row) => {
      const profile = profileById.get(row.user_id);
      const eventInfo = eventById.get(row.event_id);
      const checkoutDraft = paidCheckoutDraftBySubmissionId.get(row.id);
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
        paid_amount_cents: checkoutDraft?.amount_cents ?? null,
        type_label: eventInfo?.signup_mode === "waitlist" ? "Waitlist" : "Registration",
        registration_name: null,
      };
    });

    const sundayLeagueRegistrations: RegistrationRecord[] = sundayLeagueTeams.map((team) => {
      const profile = profileById.get(team.user_id);
      const checkoutDraft = getBestSundayLeagueCheckoutDraft({
        team,
        drafts: paidSundayLeagueCheckoutDrafts,
        configuredDepositAmountCents: sundayLeagueDepositAmountCents,
      });
      const teamPayload = getJsonRecord((checkoutDraft?.team_payload as JsonValue | undefined) ?? null);
      return {
        id: team.id,
        submitted_at: team.created_at ?? checkoutDraft?.created_at ?? null,
        user_id: team.user_id,
        user_name: profile?.name?.trim() || team.captain_name || "Unknown captain",
        user_email: team.captain_email,
        user_phone: team.captain_phone ?? null,
        answers: buildSundayLeagueRegistrationAnswers(team, teamPayload),
        attachments: collectSundayLeagueAttachments(team, teamPayload),
        waiver_accepted: false,
        event_id: `sunday-league-division-${team.division}`,
        event_title: `Sunday League Division ${team.division}`,
        signup_mode: "registration",
        paid_amount_cents: checkoutDraft?.amount_cents ?? (team.deposit_status === "paid" ? sundayLeagueDepositAmountCents : null),
        type_label: "Sunday League Team",
        registration_name: team.team_name,
      };
    });

    const resolved: RegistrationRecord[] = [...eventRegistrations, ...sundayLeagueRegistrations].sort((a, b) => {
      const aTime = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
      const bTime = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
      return bTime - aTime;
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

  const announcementRecipientDirectory = useMemo(
    () => users,
    [users],
  );

  const selectedAnnouncementPlayers = useMemo(() => {
    const selectedIds = new Set(announcementForm.recipientIds);
    return announcementRecipientDirectory.filter((user) => selectedIds.has(user.id));
  }, [announcementForm.recipientIds, announcementRecipientDirectory]);

  const filteredAnnouncementPlayers = useMemo(() => {
    const selectedIds = new Set(announcementForm.recipientIds);
    const query = announcementRecipientSearch.trim().toLowerCase();

    return announcementRecipientDirectory
      .filter((user) => {
        if (selectedIds.has(user.id)) {
          return false;
        }

        if (!query) {
          return true;
        }

        const sports = Array.isArray(user.sports) ? user.sports.join(" ").toLowerCase() : "";
        return user.name.toLowerCase().includes(query) || sports.includes(query);
      })
      .slice(0, 12);
  }, [announcementForm.recipientIds, announcementRecipientSearch, announcementRecipientDirectory]);

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
      if (canAccessAdminDashboard(role)) {
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

  const updateFormSportId = (sportId: string) => {
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
      sport_id: "",
      registration_enabled: false,
      waiver_url: "",
      registration_limit: "",
      payment_required: false,
      payment_amount: "",
      require_waiver: false,
      registration_fields: [],
    });
  };

  const resetSportForm = () => {
    setSportForm(createEmptySportForm());
  };

  const resetScheduleWeekForm = () => {
    setScheduleWeekForm(createEmptySundayLeagueScheduleForm());
  };

  const resetEditScheduleWeekForm = () => {
    setEditScheduleWeekForm(createEmptySundayLeagueScheduleForm());
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

  const openCreateScheduleWeekForm = () => {
    resetScheduleWeekForm();
    setScheduleWeeksStatus({ type: "idle" });
    setShowCreateScheduleWeekForm(true);
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

  const closeCreateScheduleWeekForm = () => {
    resetScheduleWeekForm();
    setScheduleWeeksStatus({ type: "idle" });
    setShowCreateScheduleWeekForm(false);
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
      sport_id: event.sport_id ?? "",
      registration_enabled: Boolean(event.registration_enabled),
      waiver_url: event.waiver_url ?? "",
      registration_limit: event.registration_limit?.toString() ?? "",
      payment_required: Boolean(event.payment_required),
      payment_amount: event.payment_amount_cents ? (event.payment_amount_cents / 100).toFixed(2) : "",
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

  const startEditingScheduleWeek = (week: SundayLeagueScheduleWeek) => {
    setEditingScheduleWeekId(week.id);
    setExpandedScheduleWeekCards((prev) => ({ ...prev, [week.id]: true }));
    setEditScheduleWeekForm({
      blackSheepField: week.black_sheep_field_schedule ?? "",
      magicFountainField: week.magic_fountain_field_schedule ?? "",
    });
    setScheduleWeeksStatus({ type: "idle" });
  };

  const cancelEditingScheduleWeek = () => {
    setEditingScheduleWeekId(null);
    resetEditScheduleWeekForm();
  };

  const toggleScheduleWeekCardExpanded = (weekId: string) => {
    setExpandedScheduleWeekCards((prev) => ({ ...prev, [weekId]: !prev[weekId] }));
  };

  const updateEdit = <K extends keyof EventFormState>(key: K, value: EventFormState[K]) => {
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

  const updateEditSport = <K extends keyof SportFormState>(key: K, value: SportFormState[K]) => {
    setEditSportForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateScheduleWeekForm = <K extends keyof SundayLeagueScheduleFormState>(
    key: K,
    value: SundayLeagueScheduleFormState[K],
  ) => {
    setScheduleWeekForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateEditScheduleWeekForm = <K extends keyof SundayLeagueScheduleFormState>(
    key: K,
    value: SundayLeagueScheduleFormState[K],
  ) => {
    setEditScheduleWeekForm((prev) => ({ ...prev, [key]: value }));
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
    const nextField = { ...createEmptyRegistrationField(), expanded: true };
    const apply = (prev: EventFormState) => ({
      ...prev,
      registration_fields: [...prev.registration_fields, nextField],
    });
    if (target === "create") {
      setCreateRegistrationFieldsVisible(true);
      setForm(apply);
      return;
    }
    setEditRegistrationFieldsVisible(true);
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
          <button className="button ghost" type="button" onClick={() => addRegistrationField(target)}>
            Add field
          </button>
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

      {state.signup_mode === "waitlist" ? null : (
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
      )}
    </div>
    );
  };

  const updateSundayLeagueSignupField = (
    fieldId: string,
    key: keyof SundayLeagueSignupFieldEditor,
    value: SundayLeagueSignupFieldEditor[keyof SundayLeagueSignupFieldEditor],
  ) => {
    setSundayLeagueSignupFields((prev) =>
      prev.map((field) => (field.id === fieldId ? ({ ...field, [key]: value } as SundayLeagueSignupFieldEditor) : field)),
    );
  };

  const addSundayLeagueSignupField = () => {
    const nextField = createEmptySundayLeagueSignupFieldEditor();
    setSundayLeagueSignupFieldsVisible(true);
    setSundayLeagueSignupFields((prev) => [...prev, nextField]);
  };

  const toggleSundayLeagueSignupFieldExpanded = (fieldId: string) => {
    setSundayLeagueSignupFields((prev) =>
      prev.map((field) => (field.id === fieldId ? { ...field, expanded: !field.expanded } : field)),
    );
  };

  const collapseSundayLeagueSignupField = (fieldId: string) => {
    setSundayLeagueSignupFields((prev) =>
      prev.map((field) => (field.id === fieldId ? { ...field, expanded: false } : field)),
    );
  };

  const removeSundayLeagueSignupField = (fieldId: string) => {
    setSundayLeagueSignupFields((prev) => prev.filter((field) => field.id !== fieldId));
  };

  const moveSundayLeagueSignupField = (fieldId: string, direction: -1 | 1) => {
    setSundayLeagueSignupFields((prev) => {
      const index = prev.findIndex((field) => field.id === fieldId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) {
        return prev;
      }

      const nextFields = [...prev];
      const [field] = nextFields.splice(index, 1);
      nextFields.splice(nextIndex, 0, field);
      return nextFields;
    });
  };

  const renderSundayLeagueSignupBuilder = () => {
    const hasFields = sundayLeagueSignupFields.length > 0;

    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div className="account-card__header">
          <div>
            <h2>Signup Form Fields</h2>
            <p className="muted">These fields power the public Create Team form on the Sunday League page.</p>
          </div>
          <button
            className="button ghost"
            type="button"
            onClick={() => void loadSundayLeagueSignupForm()}
            disabled={loadingSundayLeagueSignupForm}
          >
            {loadingSundayLeagueSignupForm ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="button ghost"
            type="button"
            onClick={() => setSundayLeagueSignupFieldsVisible((prev) => !prev)}
          >
            {sundayLeagueSignupFieldsVisible ? "Collapse all" : "Expand all"}
          </button>
          <button className="button ghost" type="button" onClick={addSundayLeagueSignupField}>
            Add field
          </button>
        </div>

        {!sundayLeagueSignupFieldsVisible ? (
          <p className="muted">
            {hasFields
              ? `${sundayLeagueSignupFields.length} signup field${sundayLeagueSignupFields.length === 1 ? "" : "s"} hidden.`
              : "Signup fields are hidden."}
          </p>
        ) : sundayLeagueSignupFields.length === 0 ? (
          <p className="muted">No signup fields yet.</p>
        ) : (
          sundayLeagueSignupFields.map((field, index) => (
            <div key={field.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <p className="list__title" style={{ margin: 0 }}>
                    {field.label.trim() || `Field ${index + 1}`}
                  </p>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    {field.name.trim() || slugifyFieldName(field.label) || "no_key"} • {field.type}{field.required ? " • required" : ""}
                  </p>
                </div>
                {!field.expanded ? (
                  <button className="button ghost" type="button" onClick={() => toggleSundayLeagueSignupFieldExpanded(field.id)}>
                    Expand
                  </button>
                ) : null}
              </div>

              {field.expanded ? (
                <>
                  <div className="register-form-grid">
                    <div className="form-control">
                      <label htmlFor={`sunday-league-field-label-${field.id}`}>Field label</label>
                      <input
                        id={`sunday-league-field-label-${field.id}`}
                        value={field.label}
                        onChange={(e) => updateSundayLeagueSignupField(field.id, "label", e.target.value)}
                        placeholder="Team name"
                      />
                    </div>
                    <div className="form-control">
                      <label htmlFor={`sunday-league-field-placeholder-${field.id}`}>Placeholder</label>
                      <input
                        id={`sunday-league-field-placeholder-${field.id}`}
                        value={field.placeholder}
                        onChange={(e) => updateSundayLeagueSignupField(field.id, "placeholder", e.target.value)}
                      />
                    </div>
                    <div className="form-control">
                      <label htmlFor={`sunday-league-field-type-${field.id}`}>Field type</label>
                      <select
                        id={`sunday-league-field-type-${field.id}`}
                        value={field.type}
                        onChange={(e) => updateSundayLeagueSignupField(field.id, "type", e.target.value as SundayLeagueSignupFieldType)}
                      >
                        {SUNDAY_LEAGUE_SIGNUP_FIELD_TYPE_OPTIONS.map((option) => (
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
                        onChange={(e) => updateSundayLeagueSignupField(field.id, "required", e.target.checked)}
                      />
                      <span>Required field</span>
                    </label>
                  </div>

                  {field.type === "select" ? (
                    <div className="form-control">
                      <label htmlFor={`sunday-league-field-options-${field.id}`}>Options</label>
                      <textarea
                        id={`sunday-league-field-options-${field.id}`}
                        value={field.optionsText}
                        onChange={(e) => updateSundayLeagueSignupField(field.id, "optionsText", e.target.value)}
                        rows={4}
                        placeholder={"Division 1\nDivision 2"}
                      />
                      <p className="form-help muted">One option per line.</p>
                    </div>
                  ) : null}
                </>
              ) : null}

              <div className="cta-row">
                {field.expanded ? (
                  <button className="button primary" type="button" onClick={() => collapseSundayLeagueSignupField(field.id)}>
                    Save field
                  </button>
                ) : null}
                <button className="button ghost" type="button" onClick={() => moveSundayLeagueSignupField(field.id, -1)} disabled={index === 0}>
                  Move up
                </button>
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => moveSundayLeagueSignupField(field.id, 1)}
                  disabled={index === sundayLeagueSignupFields.length - 1}
                >
                  Move down
                </button>
                <button className="button ghost" type="button" onClick={() => removeSundayLeagueSignupField(field.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  const handleSaveSundayLeagueSignupForm = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setSundayLeagueSignupStatus({ type: "error", message: "Sign in again to continue." });
      return;
    }

    setSundayLeagueSignupStatus({ type: "loading" });

    try {
      const response = await fetch("/api/admin/sunday-league-signup-form", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          form: buildSundayLeagueSignupForm(sundayLeagueSignupFields),
        }),
      });
      const json = await response.json();

      if (!response.ok) {
        setSundayLeagueSignupStatus({ type: "error", message: json?.error ?? "Could not update the Sunday League signup form." });
        return;
      }

      setSundayLeagueSignupFields(parseSundayLeagueSignupEditorFields(json?.form));
      setSundayLeagueSignupStatus({ type: "success", message: "Sunday League signup form updated." });
    } catch {
      setSundayLeagueSignupStatus({ type: "error", message: "Could not update the Sunday League signup form." });
    }
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

    const isWaitlist = form.signup_mode === "waitlist";
    const paymentAmountValue = Number(form.payment_amount);
    const paymentAmountCents = Math.round(paymentAmountValue * 100);
    if (!isWaitlist && form.payment_required && (!Number.isFinite(paymentAmountValue) || paymentAmountCents <= 0)) {
      setFormStatus({ type: "error", message: "Enter a payment amount greater than $0.00 when payment is required." });
      return;
    }

    setFormStatus({ type: "loading" });
    const registrationSchema = buildRegistrationSchema({
      ...form,
      require_waiver: isWaitlist ? false : form.require_waiver,
    });
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
      sport_id: form.sport_id || null,
      registration_enabled: form.registration_enabled,
      waiver_url: isWaitlist ? null : form.waiver_url.trim() || null,
      allow_multiple_registrations: false,
      registration_limit: isWaitlist ? null : form.registration_limit.trim() ? Number(form.registration_limit) : null,
      payment_required: isWaitlist ? false : form.payment_required,
      payment_amount_cents: isWaitlist || !form.payment_required ? null : paymentAmountCents,
      registration_schema: registrationSchema,
      approval_status: "approved" as const,
      approved_at: new Date().toISOString(),
      approved_by_user_id: currentUserId,
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

  const uploadManagedImage = async (folder: "events" | "sports" | "events/community-sponsors", file: File) => {
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

    const isWaitlist = editForm.signup_mode === "waitlist";
    const paymentAmountValue = Number(editForm.payment_amount);
    const paymentAmountCents = Math.round(paymentAmountValue * 100);
    if (!isWaitlist && editForm.payment_required && (!Number.isFinite(paymentAmountValue) || paymentAmountCents <= 0)) {
      setFormStatus({ type: "error", message: "Enter a payment amount greater than $0.00 when payment is required." });
      return;
    }

    setSavingEditId(eventId);
    const currentEvent = events.find((event) => event.id === eventId);
    const registrationSchema = buildRegistrationSchema({
      ...editForm,
      require_waiver: isWaitlist ? false : editForm.require_waiver,
    });
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
      sport_id: editForm.sport_id || null,
      registration_enabled: editForm.registration_enabled,
      waiver_url: isWaitlist ? null : editForm.waiver_url.trim() || null,
      allow_multiple_registrations: false,
      registration_limit: isWaitlist ? null : editForm.registration_limit.trim() ? Number(editForm.registration_limit) : null,
      payment_required: isWaitlist ? false : editForm.payment_required,
      payment_amount_cents: isWaitlist || !editForm.payment_required ? null : paymentAmountCents,
      registration_schema: registrationSchema,
      approval_status: currentEvent?.host_type === "partner" ? currentEvent.approval_status ?? "pending_approval" : "approved",
      approval_notes: currentEvent?.host_type === "partner" ? currentEvent.approval_notes ?? null : null,
      created_by_user_id: currentEvent?.created_by_user_id ?? null,
      approved_at:
        currentEvent?.host_type === "partner"
          ? currentEvent.approved_at ?? null
          : currentEvent?.approved_at ?? new Date().toISOString(),
      approved_by_user_id:
        currentEvent?.host_type === "partner"
          ? currentEvent.approved_by_user_id ?? null
          : currentEvent?.approved_by_user_id ?? currentUserId,
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

  const getNextScheduleWeekNumber = () =>
    scheduleWeeks.reduce((max, week) => Math.max(max, week.week_number), 0) + 1;

  const handleCreateScheduleWeek = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      setScheduleWeeksStatus({ type: "error", message: "Supabase is not configured." });
      return;
    }

    const blackSheepField = scheduleWeekForm.blackSheepField.trim();
    const magicFountainField = scheduleWeekForm.magicFountainField.trim();

    if (!blackSheepField || !magicFountainField) {
      setScheduleWeeksStatus({ type: "error", message: "Both field schedule text boxes are required." });
      return;
    }

    setScheduleWeeksStatus({ type: "loading" });

    const { error } = await supabase.from("sunday_league_schedule_weeks").insert({
      week_number: getNextScheduleWeekNumber(),
      black_sheep_field_schedule: blackSheepField,
      magic_fountain_field_schedule: magicFountainField,
    });

    if (error) {
      setScheduleWeeksStatus({ type: "error", message: error.message ?? "Could not add schedule week." });
      return;
    }

    setScheduleWeeksStatus({ type: "success", message: "Schedule week added." });
    resetScheduleWeekForm();
    setShowCreateScheduleWeekForm(false);
    await loadScheduleWeeks();
  };

  const handleSaveScheduleWeek = async (weekId: string) => {
    if (!supabase) {
      setScheduleWeeksStatus({ type: "error", message: "Supabase is not configured." });
      return;
    }

    const blackSheepField = editScheduleWeekForm.blackSheepField.trim();
    const magicFountainField = editScheduleWeekForm.magicFountainField.trim();

    if (!blackSheepField || !magicFountainField) {
      setScheduleWeeksStatus({ type: "error", message: "Both field schedule text boxes are required." });
      return;
    }

    setSavingScheduleWeekId(weekId);
    setScheduleWeeksStatus({ type: "loading" });

    const { error } = await supabase
      .from("sunday_league_schedule_weeks")
      .update({
        black_sheep_field_schedule: blackSheepField,
        magic_fountain_field_schedule: magicFountainField,
      })
      .eq("id", weekId);

    setSavingScheduleWeekId(null);

    if (error) {
      setScheduleWeeksStatus({ type: "error", message: error.message ?? "Could not save schedule week." });
      return;
    }

    setScheduleWeeksStatus({ type: "success", message: "Schedule week updated." });
    cancelEditingScheduleWeek();
    await loadScheduleWeeks();
  };

  const handleDeleteScheduleWeek = async (week: SundayLeagueScheduleWeek) => {
    if (!supabase) return;
    const confirmed = window.confirm(`Delete Week ${week.week_number}? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingScheduleWeekId(week.id);
    const { error } = await supabase.from("sunday_league_schedule_weeks").delete().eq("id", week.id);
    setDeletingScheduleWeekId(null);

    if (error) {
      setScheduleWeeksStatus({ type: "error", message: error.message ?? "Could not delete schedule week." });
      return;
    }

    if (editingScheduleWeekId === week.id) {
      cancelEditingScheduleWeek();
    }

    setScheduleWeeksStatus({ type: "success", message: `Week ${week.week_number} deleted.` });
    await loadScheduleWeeks();
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
      void loadSports();
    }
    if (module === "sundayLeague") {
      void loadSundayLeagueSettings();
      void loadSundayLeagueSignupForm();
      void loadScheduleWeeks();
    }
    if (module === "sports") {
      void loadSports();
    }
    if (module === "registrations") {
      void loadSundayLeagueSettings();
      void loadRegistrations();
    }
    if (module === "community") {
      void loadCommunityArticles();
      void loadCommunityContent();
      void loadCommunitySponsors();
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
    if (module === "settings") {
      void loadEvents();
      void loadSiteSettings();
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

  const updateCommunitySponsor = <K extends keyof typeof communitySponsorForm>(key: K, value: (typeof communitySponsorForm)[K]) => {
    setCommunitySponsorForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetCommunitySponsorForm = () => {
    setCommunitySponsorForm({
      name: "",
      description: "",
      image: "",
      placement: "standard",
      websiteUrl: "",
      instagramUrl: "",
    });
  };

  const openCreateSponsorForm = () => {
    resetCommunitySponsorForm();
    setCommunitySponsorsStatus({ type: "idle" });
    setShowCreateSponsorForm(true);
  };

  const closeCreateSponsorForm = () => {
    resetCommunitySponsorForm();
    setCommunitySponsorsStatus({ type: "idle" });
    setShowCreateSponsorForm(false);
  };

  const updateCommunitySponsorEdit = <K extends keyof typeof communitySponsorEditForm>(key: K, value: (typeof communitySponsorEditForm)[K]) => {
    setCommunitySponsorEditForm((prev) => ({ ...prev, [key]: value }));
  };

  const startEditingCommunitySponsor = (sponsor: CommunitySponsor) => {
    setExpandedCommunitySponsorCards((prev) => ({ ...prev, [sponsor.id]: true }));
    setEditingSponsorId(sponsor.id);
    setCommunitySponsorEditForm({
      name: sponsor.name ?? "",
      description: sponsor.description ?? "",
      image: sponsor.image ?? "",
      placement: sponsor.placement ?? "standard",
      websiteUrl: sponsor.websiteUrl ?? "",
      instagramUrl: sponsor.instagramUrl ?? "",
    });
    setCommunitySponsorsStatus({ type: "idle" });
  };

  const cancelEditingCommunitySponsor = () => {
    setEditingSponsorId(null);
    setCommunitySponsorsStatus({ type: "idle" });
  };

  const toggleCommunitySponsorCard = (id: string) => {
    setExpandedCommunitySponsorCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const countTopSponsors = (excludedId?: string) =>
    communitySponsors.filter((sponsor) => sponsor.placement === "top" && sponsor.id !== excludedId).length;

  const sponsorPlacementLabel = (placement: CommunitySponsorPlacement) =>
    placement === "top" ? "Top Sponsors" : "Regular Sponsors";

  const updateCommunityContent = (key: keyof typeof communityContentForm, value: string) => {
    setCommunityContentForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateSiteSettings = <K extends keyof typeof siteSettingsForm>(key: K, value: (typeof siteSettingsForm)[K]) => {
    setSiteSettingsForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateSundayLeagueSettings = <K extends keyof typeof sundayLeagueSettingsForm>(
    key: K,
    value: (typeof sundayLeagueSettingsForm)[K],
  ) => {
    setSundayLeagueSettingsForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateAnnouncementForm = <K extends keyof AnnouncementFormState>(key: K, value: AnnouncementFormState[K]) => {
    setAnnouncementForm((prev) => ({ ...prev, [key]: value }));
  };

  const addAnnouncementRecipient = (userId: string) => {
    setAnnouncementForm((prev) => ({
      ...prev,
      recipientIds: prev.recipientIds.includes(userId) ? prev.recipientIds : [...prev.recipientIds, userId],
    }));
    setAnnouncementRecipientSearch("");
  };

  const removeAnnouncementRecipient = (userId: string) => {
    setAnnouncementForm((prev) => ({
      ...prev,
      recipientIds: prev.recipientIds.filter((id) => id !== userId),
    }));
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

  const savePartnerApproval = async (eventId: string, approvalStatus: "approved" | "changes_requested") => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setFormStatus({ type: "error", message: "Sign in again to continue." });
      return;
    }

    setSavingPartnerApprovalId(eventId);
    setFormStatus({ type: "idle" });

    try {
      const response = await fetch(`/api/admin/partner-events/${eventId}/approval`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          status: approvalStatus,
          notes: partnerApprovalNotes[eventId] ?? "",
        }),
      });

      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(json?.error ?? "Could not update partner approval.");
      }

      setFormStatus({
        type: "success",
        message: approvalStatus === "approved" ? "Partner event approved." : "Changes requested for partner event.",
      });
      await loadEvents();
    } catch (error) {
      setFormStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Could not update partner approval.",
      });
    } finally {
      setSavingPartnerApprovalId(null);
    }
  };

  const handleCreateCommunitySponsor = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      setCommunitySponsorsStatus({ type: "error", message: "Supabase is not configured." });
      return;
    }

    if (
      !communitySponsorForm.name.trim() ||
      !communitySponsorForm.description.trim() ||
      !communitySponsorForm.image.trim()
    ) {
      setCommunitySponsorsStatus({ type: "error", message: "Business name, description, and image are required." });
      return;
    }
    if (communitySponsorForm.placement === "top" && countTopSponsors() >= 2) {
      setCommunitySponsorsStatus({ type: "error", message: "Top Sponsors can only contain two sponsors." });
      return;
    }

    setCommunitySponsorsStatus({ type: "loading" });
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setCommunitySponsorsStatus({ type: "error", message: "Sign in again to continue." });
      return;
    }

    const payload = {
      name: communitySponsorForm.name.trim(),
      description: communitySponsorForm.description.trim(),
      image: communitySponsorForm.image.trim(),
      placement: communitySponsorForm.placement,
      websiteUrl: communitySponsorForm.websiteUrl.trim(),
      instagramUrl: communitySponsorForm.instagramUrl.trim(),
    };

    try {
      const response = await fetch("/api/admin/community-sponsors", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) {
        setCommunitySponsorsStatus({ type: "error", message: json?.error ?? "Could not save sponsor." });
        return;
      }

      setCommunitySponsorsStatus({ type: "success", message: "Community sponsor added." });
      resetCommunitySponsorForm();
      setShowCreateSponsorForm(false);
      setCommunitySponsors((json?.sponsors ?? []) as CommunitySponsor[]);
    } catch {
      setCommunitySponsorsStatus({ type: "error", message: "Could not save sponsor." });
    }
  };

  const handleSaveCommunitySponsor = async (id: string) => {
    if (!supabase) return;
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setCommunitySponsorsStatus({ type: "error", message: "Sign in again to continue." });
      return;
    }

    if (
      !communitySponsorEditForm.name.trim() ||
      !communitySponsorEditForm.description.trim() ||
      !communitySponsorEditForm.image.trim()
    ) {
      setCommunitySponsorsStatus({ type: "error", message: "Business name, description, and image are required." });
      return;
    }
    if (communitySponsorEditForm.placement === "top" && countTopSponsors(id) >= 2) {
      setCommunitySponsorsStatus({ type: "error", message: "Top Sponsors can only contain two sponsors." });
      return;
    }

    setCommunitySponsorsStatus({ type: "loading" });
    const payload = {
      id,
      name: communitySponsorEditForm.name.trim(),
      description: communitySponsorEditForm.description.trim(),
      image: communitySponsorEditForm.image.trim(),
      placement: communitySponsorEditForm.placement,
      websiteUrl: communitySponsorEditForm.websiteUrl.trim(),
      instagramUrl: communitySponsorEditForm.instagramUrl.trim(),
    };

    try {
      const response = await fetch("/api/admin/community-sponsors", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) {
        setCommunitySponsorsStatus({ type: "error", message: json?.error ?? "Could not update sponsor." });
        return;
      }

      setCommunitySponsorsStatus({ type: "success", message: "Sponsor updated." });
      setCommunitySponsors((json?.sponsors ?? []) as CommunitySponsor[]);
      setEditingSponsorId(null);
    } catch {
      setCommunitySponsorsStatus({ type: "error", message: "Could not update sponsor." });
    }
  };

  const handleDeleteCommunitySponsor = async (sponsor: CommunitySponsor) => {
    if (!supabase) return;
    const confirmed = window.confirm(`Delete sponsor "${sponsor.name}"?`);
    if (!confirmed) return;

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setCommunitySponsorsStatus({ type: "error", message: "Sign in again to continue." });
      return;
    }

    setCommunitySponsorsStatus({ type: "loading" });
    try {
      const response = await fetch("/api/admin/community-sponsors", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id: sponsor.id }),
      });
      const json = await response.json();
      if (!response.ok) {
        setCommunitySponsorsStatus({ type: "error", message: json?.error ?? "Could not delete sponsor." });
        return;
      }

      setCommunitySponsorsStatus({ type: "success", message: "Sponsor deleted." });
      setCommunitySponsors((json?.sponsors ?? []) as CommunitySponsor[]);
      setExpandedCommunitySponsorCards((prev) => {
        const next = { ...prev };
        delete next[sponsor.id];
        return next;
      });
      if (editingSponsorId === sponsor.id) {
        setEditingSponsorId(null);
      }
    } catch {
      setCommunitySponsorsStatus({ type: "error", message: "Could not delete sponsor." });
    }
  };

  const handleCreateCommunitySponsorImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setCommunitySponsorsStatus({ type: "error", message: "Please select a valid image file." });
      return;
    }

    try {
      setUploadingCreateSponsorImage(true);
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setCommunitySponsorsStatus({ type: "error", message: "Sign in again to continue." });
        return;
      }

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/admin/community-sponsor-upload", {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });
      const json = await response.json();
      if (!response.ok || typeof json?.imageUrl !== "string") {
        setCommunitySponsorsStatus({ type: "error", message: json?.error ?? "Could not upload image." });
        return;
      }

      const publicUrl = json.imageUrl;
      updateCommunitySponsor("image", publicUrl);
      setCommunitySponsorsStatus({
        type: "success",
        message: "Image uploaded. The generated URL was added to the sponsor form. Click Add Sponsor to save it.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload image.";
      setCommunitySponsorsStatus({ type: "error", message: `${message} (Bucket: ${EVENT_IMAGE_BUCKET})` });
    } finally {
      setUploadingCreateSponsorImage(false);
      e.target.value = "";
    }
  };

  const handleEditCommunitySponsorImageUpload = async (sponsorId: string, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setCommunitySponsorsStatus({ type: "error", message: "Please select a valid image file." });
      return;
    }

    try {
      setUploadingEditSponsorImageId(sponsorId);
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setCommunitySponsorsStatus({ type: "error", message: "Sign in again to continue." });
        return;
      }

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/admin/community-sponsor-upload", {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });
      const json = await response.json();
      if (!response.ok || typeof json?.imageUrl !== "string") {
        setCommunitySponsorsStatus({ type: "error", message: json?.error ?? "Could not upload image." });
        return;
      }

      const publicUrl = json.imageUrl;
      updateCommunitySponsorEdit("image", publicUrl);
      setCommunitySponsorsStatus({
        type: "success",
        message: "Image uploaded. Click Save to publish this updated sponsor card.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload image.";
      setCommunitySponsorsStatus({ type: "error", message: `${message} (Bucket: ${EVENT_IMAGE_BUCKET})` });
    } finally {
      setUploadingEditSponsorImageId(null);
      e.target.value = "";
    }
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

  const handleSaveSiteSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setSiteSettingsStatus({ type: "error", message: "Sign in again to continue." });
      return;
    }

    const homeBannerText = siteSettingsForm.homeBannerText.trim();
    const homeBannerButtonEventId = siteSettingsForm.homeBannerButtonEventId.trim();
    const homeBannerButtonPageHref = siteSettingsForm.homeBannerButtonPageHref.trim();
    if (siteSettingsForm.homeBannerEnabled && !homeBannerText) {
      setSiteSettingsStatus({ type: "error", message: "Banner text is required when the banner is enabled." });
      return;
    }
    if (siteSettingsForm.homeBannerButtonTarget === "event" && !homeBannerButtonEventId) {
      setSiteSettingsStatus({ type: "error", message: "Choose an event for the banner button." });
      return;
    }
    if (siteSettingsForm.homeBannerButtonTarget === "page" && !homeBannerButtonPageHref) {
      setSiteSettingsStatus({ type: "error", message: "Choose a page for the banner button." });
      return;
    }

    setSiteSettingsStatus({ type: "loading" });
    try {
      const response = await fetch("/api/admin/site-settings", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          homeBanner: {
            enabled: siteSettingsForm.homeBannerEnabled,
            text: homeBannerText,
            buttonTarget: siteSettingsForm.homeBannerButtonTarget,
            buttonEventId: homeBannerButtonEventId,
            buttonPageHref: homeBannerButtonPageHref,
          },
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        setSiteSettingsStatus({ type: "error", message: json?.error ?? "Could not update site settings." });
        return;
      }

      const settings = (json?.settings ?? {}) as {
        homeBanner?: {
          enabled?: boolean;
          text?: string;
          buttonTarget?: HomeBannerButtonTarget;
          buttonEventId?: string;
          buttonPageHref?: string;
        };
      };

      setSiteSettingsForm({
        homeBannerEnabled: Boolean(settings.homeBanner?.enabled),
        homeBannerText:
          typeof settings.homeBanner?.text === "string"
            ? settings.homeBanner.text
            : homeBannerText,
        homeBannerButtonTarget: settings.homeBanner?.buttonTarget === "event" || settings.homeBanner?.buttonTarget === "page"
          ? settings.homeBanner.buttonTarget
          : "none",
        homeBannerButtonEventId:
          typeof settings.homeBanner?.buttonEventId === "string"
            ? settings.homeBanner.buttonEventId
            : homeBannerButtonEventId,
        homeBannerButtonPageHref:
          typeof settings.homeBanner?.buttonPageHref === "string"
            ? settings.homeBanner.buttonPageHref
            : homeBannerButtonPageHref,
      });
      setSiteSettingsStatus({ type: "success", message: "Home page banner settings updated." });
    } catch {
      setSiteSettingsStatus({ type: "error", message: "Could not update site settings." });
    }
  };

  const handleSaveSundayLeagueSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setSundayLeagueSettingsStatus({ type: "error", message: "Sign in again to continue." });
      return;
    }

    const depositAmountValue = Number(sundayLeagueSettingsForm.depositAmount);
    const depositAmountCents = Math.round(depositAmountValue * 100);

    if (!Number.isFinite(depositAmountValue) || depositAmountCents <= 0) {
      setSundayLeagueSettingsStatus({ type: "error", message: "Enter a deposit amount greater than $0.00." });
      return;
    }

    setSundayLeagueSettingsStatus({ type: "loading" });

    try {
      const response = await fetch("/api/admin/sunday-league-settings", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ depositAmountCents }),
      });
      const json = await response.json();

      if (!response.ok) {
        setSundayLeagueSettingsStatus({ type: "error", message: json?.error ?? "Could not update Sunday League deposit settings." });
        return;
      }

      const savedDepositAmountCents =
        typeof json?.settings?.depositAmountCents === "number"
          ? json.settings.depositAmountCents
          : depositAmountCents;

      setSundayLeagueSettingsForm({
        depositAmount: (savedDepositAmountCents / 100).toFixed(2),
      });
      setSundayLeagueSettingsStatus({
        type: "success",
        message: `Sunday League deposit updated to ${formatSundayLeagueDepositAmount(savedDepositAmountCents)}.`,
      });
    } catch {
      setSundayLeagueSettingsStatus({ type: "error", message: "Could not update Sunday League deposit settings." });
    }
  };

  const handleSendAnnouncement = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setAnnouncementStatus({ type: "error", message: "Sign in again to continue." });
      return;
    }

    const title = announcementForm.title.trim();
    const message = announcementForm.message.trim();

    if (!title) {
      setAnnouncementStatus({ type: "error", message: "Title is required." });
      return;
    }

    if (!message) {
      setAnnouncementStatus({ type: "error", message: "Message is required." });
      return;
    }

    if (announcementForm.audience === "selected_players" && announcementForm.recipientIds.length === 0) {
      setAnnouncementStatus({ type: "error", message: "Choose at least one member." });
      return;
    }

    setAnnouncementStatus({ type: "loading" });

    try {
      const response = await fetch("/api/admin/inbox-announcements", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          audience: announcementForm.audience,
          recipientIds: announcementForm.recipientIds,
          title,
          message,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        setAnnouncementStatus({ type: "error", message: json?.error ?? "Could not send the announcement." });
        return;
      }

      const sentCount = typeof json?.sentCount === "number" ? json.sentCount : null;
      setAnnouncementForm(createEmptyAnnouncementForm());
      setAnnouncementRecipientSearch("");
      setAnnouncementStatus({
        type: "success",
        message: sentCount !== null
          ? `Announcement sent to ${sentCount} member${sentCount === 1 ? "" : "s"}.`
          : "Announcement sent.",
      });
    } catch {
      setAnnouncementStatus({ type: "error", message: "Could not send the announcement." });
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
      (row.registration_name ?? "").toLowerCase().includes(term) ||
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
  const partnerRequestEvents = events.filter((event) => event.host_type === "partner" && event.approval_status !== "approved");
  const existingManageableEvents = events.filter((event) => event.host_type !== "partner" || event.approval_status === "approved");
  const pendingPartnerRequestCount = partnerRequestEvents.filter((event) => event.approval_status === "pending_approval").length;
  const renderAdminEventCards = (items: Event[], showPartnerApprovalControls: boolean) => (
    <div className="event-list admin-existing-events-list">
      {items.map((event) => (
        <article key={event.id} className="event-card-simple">
          <div className="event-card__header">
            <h3>{event.title}</h3>
          </div>
          <div className="event-card__meta">
            <p className="muted">Host: {event.host_type ?? "Unspecified"}</p>
            {event.host_type === "partner" ? (
              <p className="muted">
                Approval: {formatApprovalStatusLabel(event.approval_status)}
              </p>
            ) : null}
            <p className="muted">Date: {dateLabel(event.start_date, event.end_date)}</p>
            {event.location ? <p className="muted">Location: {event.location}</p> : null}
            {event.registration_program_slug ? (
              <p className="muted">Event type: {event.registration_program_slug}</p>
            ) : null}
            {event.sport_id ? (
              <p className="muted">Sport: {sports.find((sport) => sport.id === event.sport_id)?.title ?? event.sport_id}</p>
            ) : null}
            {event.host_type === "partner" && event.created_by_user_id ? (
              <p className="muted">
                Partner: {eventOwnerNames[event.created_by_user_id] ?? event.created_by_user_id}
              </p>
            ) : null}
            <p className="muted">
              Signup mode: {event.signup_mode === "waitlist" ? "Waitlist / interest" : "Registration"}
            </p>
            <p className="muted">
              Signup status: {event.registration_enabled ? "Open" : "Closed"}
            </p>
            <p className="muted">
              Payment: {event.payment_required && event.payment_amount_cents ? `${formatEventPaymentAmount(event.payment_amount_cents)} required` : "No payment"}
            </p>
          </div>
          {event.description ? <p className="muted">{event.description}</p> : null}
          {showPartnerApprovalControls && event.host_type === "partner" ? (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div className="form-control">
                <label htmlFor={`partner-approval-notes-${event.id}`}>Owner notes</label>
                <textarea
                  id={`partner-approval-notes-${event.id}`}
                  value={partnerApprovalNotes[event.id] ?? ""}
                  onChange={(e) =>
                    setPartnerApprovalNotes((prev) => ({
                      ...prev,
                      [event.id]: e.target.value,
                    }))
                  }
                  rows={4}
                  placeholder="Add approval notes or requested edits for the partner."
                />
              </div>
              <div className="cta-row">
                <button
                  className="button primary"
                  type="button"
                  onClick={() => void savePartnerApproval(event.id, "approved")}
                  disabled={savingPartnerApprovalId === event.id}
                >
                  {savingPartnerApprovalId === event.id ? "Saving..." : "Approve & Publish"}
                </button>
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => void savePartnerApproval(event.id, "changes_requested")}
                  disabled={savingPartnerApprovalId === event.id}
                >
                  Request Changes
                </button>
              </div>
            </div>
          ) : null}
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
                  <label htmlFor={`edit-sport-${event.id}`}>Sport page</label>
                  <select
                    id={`edit-sport-${event.id}`}
                    value={editForm.sport_id}
                    onChange={(e) => updateEditSportId(e.target.value)}
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
                  <label htmlFor={`edit-slug-${event.id}`}>Event type</label>
                  <select
                    id={`edit-slug-${event.id}`}
                    value={editForm.registration_program_slug}
                    onChange={(e) => updateEdit("registration_program_slug", e.target.value)}
                    disabled={!editForm.sport_id}
                  >
                    <option value="">{editForm.sport_id ? "Select an event type" : "Select a sport page first"}</option>
                    {getEventProgramSlugOptions(sports.find((sport) => sport.id === editForm.sport_id) ?? null).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
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
                <div className="form-control">
                  <label htmlFor={`edit-payment-amount-${event.id}`}>Payment amount (USD)</label>
                  <input
                    id={`edit-payment-amount-${event.id}`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editForm.payment_amount}
                    onChange={(e) => updateEdit("payment_amount", e.target.value)}
                    disabled={editForm.signup_mode === "waitlist" || !editForm.payment_required}
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
              <div className="form-control checkbox-control" style={{ justifySelf: "start", textAlign: "left", width: "fit-content" }}>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={editForm.payment_required}
                    onChange={(e) => updateEdit("payment_required", e.target.checked)}
                    disabled={editForm.signup_mode === "waitlist"}
                  />
                  <span>Require payment before registration is created</span>
                </label>
              </div>
              {editForm.signup_mode === "waitlist" ? (
                <p className="muted">Waitlist events can still collect custom questions. Waivers, registration limits, and payments stay disabled.</p>
              ) : null}
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
                      <label htmlFor="event-sport">Sport page</label>
                      <select
                        id="event-sport"
                        value={form.sport_id}
                        onChange={(e) => updateFormSportId(e.target.value)}
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
                      <label htmlFor="event-program-slug">Event type</label>
                      <select
                        id="event-program-slug"
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
                    <div className="form-control">
                      <label htmlFor="event-payment-amount">Payment amount (USD)</label>
                      <input
                        id="event-payment-amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={form.payment_amount}
                        onChange={(e) => update("payment_amount", e.target.value)}
                        disabled={form.signup_mode === "waitlist" || !form.payment_required}
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
                  <div className="form-control checkbox-control" style={{ justifySelf: "start", textAlign: "left", width: "fit-content" }}>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.payment_required}
                        onChange={(e) => update("payment_required", e.target.checked)}
                        disabled={form.signup_mode === "waitlist"}
                      />
                      <span>Require payment before registration is created</span>
                    </label>
                  </div>
                  {form.signup_mode === "waitlist" ? (
                    <p className="muted">Waitlist events can still collect custom questions. Waivers, registration limits, and payments stay disabled.</p>
                  ) : null}
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
                  <p className="muted">Open the event list when you want to review or edit published events.</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {showExistingEvents ? (
                    <button className="button ghost" type="button" onClick={() => void loadEvents()} disabled={loadingEvents}>
                      {loadingEvents ? "Refreshing..." : "Refresh"}
                    </button>
                  ) : null}
                  <button className="button primary" type="button" onClick={() => setShowExistingEvents((prev) => !prev)}>
                    {showExistingEvents ? "Close Events" : "View/Edit Events"}
                  </button>
                </div>
              </div>
              {showExistingEvents ? (
                <>
                  {loadingEvents ? <p className="muted">Loading events...</p> : null}
                  {eventsError ? <p className="form-help error">{eventsError}</p> : null}
                  {!loadingEvents && existingManageableEvents.length === 0 ? <p className="muted">No events found.</p> : null}
                  {!loadingEvents && existingManageableEvents.length > 0 ? renderAdminEventCards(existingManageableEvents, false) : null}
                </>
              ) : null}
            </section>

            <section className="account-card">
              <div className="account-card__header">
                <div>
                  <h2>Partner Requests</h2>
                  <p className="muted">Review new partner submissions separately before they are published.</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {showPartnerRequests ? (
                    <button className="button ghost" type="button" onClick={() => void loadEvents()} disabled={loadingEvents}>
                      {loadingEvents ? "Refreshing..." : "Refresh"}
                    </button>
                  ) : null}
                  <button
                    className="button ghost account-card__action-button"
                    type="button"
                    onClick={() => setShowPartnerRequests((prev) => !prev)}
                  >
                    {showPartnerRequests ? "Close Requests" : "Partner Requests"}
                    <span
                      className={`account-card__action-badge${pendingPartnerRequestCount > 0 ? " account-card__action-badge--unread" : ""}`}
                      aria-label={`${pendingPartnerRequestCount} pending partner request${pendingPartnerRequestCount === 1 ? "" : "s"}`}
                    >
                      {pendingPartnerRequestCount}
                    </span>
                  </button>
                </div>
              </div>
              {showPartnerRequests ? (
                <>
                  {loadingEvents ? <p className="muted">Loading partner requests...</p> : null}
                  {eventsError ? <p className="form-help error">{eventsError}</p> : null}
                  {!loadingEvents && partnerRequestEvents.length === 0 ? <p className="muted">No partner requests right now.</p> : null}
                  {!loadingEvents && partnerRequestEvents.length > 0 ? renderAdminEventCards(partnerRequestEvents, true) : null}
                </>
              ) : null}
            </section>
              </>
            ) : null}
            {activeModule === "sundayLeague" ? (
              <>
                <section className="account-card">
                  <h2>Sunday League</h2>
                  <p className="muted">Manage the public Create Team form and post weekly schedule text for Black Sheep Field and Magic Fountain Field.</p>
                </section>
                <section className="account-card">
                  <div className="account-card__header">
                    <div>
                      <h2>Deposit Settings</h2>
                      <p className="muted">Change the Square deposit amount for new Sunday League team checkouts.</p>
                    </div>
                    <button className="button ghost" type="button" onClick={() => void loadSundayLeagueSettings()} disabled={loadingSundayLeagueSettings}>
                      {loadingSundayLeagueSettings ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                  <form className="register-form" onSubmit={handleSaveSundayLeagueSettings}>
                    <div className="form-control">
                      <label htmlFor="sunday-league-deposit-amount">Deposit Amount (USD)</label>
                      <input
                        id="sunday-league-deposit-amount"
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        step="0.01"
                        value={sundayLeagueSettingsForm.depositAmount}
                        onChange={(e) => updateSundayLeagueSettings("depositAmount", e.target.value)}
                        required
                      />
                      <p className="form-help muted">
                        New Sunday League team reservations will charge{" "}
                        {formatSundayLeagueDepositAmount(
                          Math.max(1, Math.round(Number(sundayLeagueSettingsForm.depositAmount || "0") * 100)),
                        )}.
                      </p>
                    </div>
                    <div className="cta-row">
                      <button className="button primary" type="submit" disabled={sundayLeagueSettingsStatus.type === "loading"}>
                        {sundayLeagueSettingsStatus.type === "loading" ? "Saving..." : "Save Deposit Amount"}
                      </button>
                    </div>
                  </form>
                  {sundayLeagueSettingsStatus.message ? (
                    <p className={`form-help ${sundayLeagueSettingsStatus.type === "error" ? "error" : "muted"}`}>
                      {sundayLeagueSettingsStatus.message}
                    </p>
                  ) : null}
                </section>
                <section className="account-card">
                  <form className="register-form" onSubmit={handleSaveSundayLeagueSignupForm}>
                    {renderSundayLeagueSignupBuilder()}
                    <div className="cta-row">
                      <button className="button primary" type="submit" disabled={sundayLeagueSignupStatus.type === "loading"}>
                        {sundayLeagueSignupStatus.type === "loading" ? "Saving..." : "Save Signup Form"}
                      </button>
                    </div>
                  </form>
                  {sundayLeagueSignupStatus.message ? (
                    <p className={`form-help ${sundayLeagueSignupStatus.type === "error" ? "error" : "muted"}`}>
                      {sundayLeagueSignupStatus.message}
                    </p>
                  ) : null}
                </section>
                <section className="account-card">
                  <div className="account-card__header">
                    <div>
                      <h2>Add Week</h2>
                      <p className="muted">The next saved week will be Week {scheduleWeeks.reduce((max, week) => Math.max(max, week.week_number), 0) + 1}.</p>
                    </div>
                    {!showCreateScheduleWeekForm ? (
                      <button className="button primary" type="button" onClick={openCreateScheduleWeekForm}>
                        Add Week
                      </button>
                    ) : null}
                  </div>
                  {showCreateScheduleWeekForm ? (
                    <form className="register-form" onSubmit={handleCreateScheduleWeek}>
                      <div className="register-form-grid sunday-league-schedule-grid">
                        <div className="form-control">
                          <label htmlFor="schedule-week-black-sheep">Black Sheep Field *</label>
                          <textarea
                            id="schedule-week-black-sheep"
                            value={scheduleWeekForm.blackSheepField}
                            onChange={(e) => updateScheduleWeekForm("blackSheepField", e.target.value)}
                            rows={8}
                            required
                          />
                        </div>
                        <div className="form-control">
                          <label htmlFor="schedule-week-magic-fountain">Magic Fountain Field *</label>
                          <textarea
                            id="schedule-week-magic-fountain"
                            value={scheduleWeekForm.magicFountainField}
                            onChange={(e) => updateScheduleWeekForm("magicFountainField", e.target.value)}
                            rows={8}
                            required
                          />
                        </div>
                      </div>
                      <div className="cta-row">
                        <button className="button primary" type="submit" disabled={scheduleWeeksStatus.type === "loading"}>
                          {scheduleWeeksStatus.type === "loading" ? "Saving..." : "Save Week"}
                        </button>
                        <button className="button ghost" type="button" onClick={closeCreateScheduleWeekForm}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {scheduleWeeksStatus.message ? (
                    <p className={`form-help ${scheduleWeeksStatus.type === "error" ? "error" : "muted"}`}>{scheduleWeeksStatus.message}</p>
                  ) : null}
                </section>
                <section className="account-card">
                  <div className="account-card__header">
                    <div>
                      <h2>Existing Weeks</h2>
                      <p className="muted">Edit or remove previously posted Sunday League schedule weeks.</p>
                    </div>
                    <button className="button ghost" type="button" onClick={() => void loadScheduleWeeks()} disabled={loadingScheduleWeeks}>
                      {loadingScheduleWeeks ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                  {scheduleWeeksError ? <p className="form-help error">{scheduleWeeksError}</p> : null}
                  {loadingScheduleWeeks ? <p className="muted">Loading schedule weeks...</p> : null}
                  {!loadingScheduleWeeks && scheduleWeeks.length === 0 ? <p className="muted">No schedule weeks saved yet.</p> : null}
                  {!loadingScheduleWeeks && scheduleWeeks.length > 0 ? (
                    <div className="event-list admin-scroll-panel">
                      {scheduleWeeks.map((week) => {
                        const isExpanded = editingScheduleWeekId === week.id || Boolean(expandedScheduleWeekCards[week.id]);

                        return (
                        <article key={week.id} className="event-card-simple sunday-league-schedule-card">
                          <div className="event-card__header">
                            <h3>Week {week.week_number}</h3>
                            <button
                              className="button ghost"
                              type="button"
                              onClick={() => toggleScheduleWeekCardExpanded(week.id)}
                              disabled={editingScheduleWeekId === week.id}
                            >
                              {isExpanded ? "Collapse" : "Expand"}
                            </button>
                          </div>
                          {isExpanded && editingScheduleWeekId === week.id ? (
                            <div className="register-form" style={{ marginTop: 4 }}>
                              <div className="register-form-grid sunday-league-schedule-grid">
                                <div className="form-control">
                                  <label htmlFor={`edit-schedule-black-sheep-${week.id}`}>Black Sheep Field *</label>
                                  <textarea
                                    id={`edit-schedule-black-sheep-${week.id}`}
                                    value={editScheduleWeekForm.blackSheepField}
                                    onChange={(e) => updateEditScheduleWeekForm("blackSheepField", e.target.value)}
                                    rows={8}
                                    required
                                  />
                                </div>
                                <div className="form-control">
                                  <label htmlFor={`edit-schedule-magic-fountain-${week.id}`}>Magic Fountain Field *</label>
                                  <textarea
                                    id={`edit-schedule-magic-fountain-${week.id}`}
                                    value={editScheduleWeekForm.magicFountainField}
                                    onChange={(e) => updateEditScheduleWeekForm("magicFountainField", e.target.value)}
                                    rows={8}
                                    required
                                  />
                                </div>
                              </div>
                              <div className="cta-row">
                                <button
                                  className="button primary"
                                  type="button"
                                  onClick={() => void handleSaveScheduleWeek(week.id)}
                                  disabled={savingScheduleWeekId === week.id}
                                >
                                  {savingScheduleWeekId === week.id ? "Saving..." : "Save"}
                                </button>
                                <button className="button ghost" type="button" onClick={cancelEditingScheduleWeek}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : isExpanded ? (
                            <>
                              <div className="register-form-grid sunday-league-schedule-grid" style={{ marginTop: 0 }}>
                                <div className="form-control">
                                  <label>Black Sheep Field</label>
                                  <textarea value={week.black_sheep_field_schedule} rows={8} readOnly />
                                </div>
                                <div className="form-control">
                                  <label>Magic Fountain Field</label>
                                  <textarea value={week.magic_fountain_field_schedule} rows={8} readOnly />
                                </div>
                              </div>
                              <div className="cta-row">
                                <button className="button ghost" type="button" onClick={() => startEditingScheduleWeek(week)}>
                                  Edit
                                </button>
                                <button
                                  className="button ghost"
                                  type="button"
                                  onClick={() => void handleDeleteScheduleWeek(week)}
                                  disabled={deletingScheduleWeekId === week.id}
                                >
                                  {deletingScheduleWeekId === week.id ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            </>
                          ) : null}
                        </article>
                        );
                      })}
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
                  <h2>Community Content</h2>
                  <p className="muted">Manage the intro block, sponsor shout-outs, and featured articles shown on the Community page.</p>
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
                      <h2>Add Sponsor</h2>
                      <p className="muted">Create a sponsor callout with an image and description for the Community page.</p>
                    </div>
                    {!showCreateSponsorForm ? (
                      <button className="button primary" type="button" onClick={openCreateSponsorForm}>
                        Add Sponsor
                      </button>
                    ) : null}
                  </div>
                  {showCreateSponsorForm ? (
                    <form className="register-form" onSubmit={handleCreateCommunitySponsor}>
                      <div className="register-form-grid">
                        <div className="form-control">
                          <label htmlFor="community-sponsor-name">Business Name *</label>
                          <input
                            id="community-sponsor-name"
                            value={communitySponsorForm.name}
                            onChange={(e) => updateCommunitySponsor("name", e.target.value)}
                            required
                          />
                        </div>
                        <div className="form-control">
                          <label htmlFor="community-sponsor-image">Image URL *</label>
                          <input
                            id="community-sponsor-image"
                            value={communitySponsorForm.image}
                            onChange={(e) => updateCommunitySponsor("image", e.target.value)}
                            required
                          />
                          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <label className="button ghost" htmlFor="community-sponsor-image-upload" style={{ padding: "0.45rem 0.75rem" }}>
                              {uploadingCreateSponsorImage ? "Uploading..." : "Upload a sponsor image"}
                            </label>
                            <input
                              id="community-sponsor-image-upload"
                              type="file"
                              accept="image/*"
                              onChange={handleCreateCommunitySponsorImageUpload}
                              disabled={uploadingCreateSponsorImage}
                              style={{ display: "none" }}
                            />
                          </div>
                        </div>
                        <div className="form-control">
                          <label htmlFor="community-sponsor-placement">Sponsor Section *</label>
                          <select
                            id="community-sponsor-placement"
                            value={communitySponsorForm.placement}
                            onChange={(e) => updateCommunitySponsor("placement", e.target.value as CommunitySponsorPlacement)}
                          >
                            {COMMUNITY_SPONSOR_PLACEMENT_OPTIONS.map((placement) => (
                              <option key={placement} value={placement}>
                                {sponsorPlacementLabel(placement)}
                              </option>
                            ))}
                          </select>
                          <p className="form-help muted">Top Sponsors is limited to two sponsors and powers the split layout on the Community page.</p>
                        </div>
                      </div>
                      <div className="form-control">
                        <label htmlFor="community-sponsor-description">Description *</label>
                        <textarea
                          id="community-sponsor-description"
                          value={communitySponsorForm.description}
                          onChange={(e) => updateCommunitySponsor("description", e.target.value)}
                          rows={5}
                          required
                        />
                      </div>
                      <div className="register-form-grid">
                        <div className="form-control">
                          <label htmlFor="community-sponsor-website">Website URL</label>
                          <input
                            id="community-sponsor-website"
                            value={communitySponsorForm.websiteUrl}
                            onChange={(e) => updateCommunitySponsor("websiteUrl", e.target.value)}
                            placeholder="https://example.com"
                          />
                        </div>
                        <div className="form-control">
                          <label htmlFor="community-sponsor-instagram">Instagram URL</label>
                          <input
                            id="community-sponsor-instagram"
                            value={communitySponsorForm.instagramUrl}
                            onChange={(e) => updateCommunitySponsor("instagramUrl", e.target.value)}
                            placeholder="https://instagram.com/yourhandle"
                          />
                        </div>
                      </div>
                      {communitySponsorForm.image ? (
                        <div className="form-control">
                          <label>Preview</label>
                          <div
                            style={{
                              width: 140,
                              height: 140,
                              overflow: "hidden",
                              borderRadius: 16,
                              border: "1px solid var(--border)",
                              backgroundColor: "rgba(255, 255, 255, 0.04)",
                              backgroundImage: `url(${communitySponsorForm.image})`,
                              backgroundPosition: "center",
                              backgroundRepeat: "no-repeat",
                              backgroundSize: "cover",
                            }}
                            role="img"
                            aria-label={communitySponsorForm.name || "Sponsor preview"}
                            aria-hidden={!communitySponsorForm.name}
                          />
                        </div>
                      ) : null}
                      <div className="cta-row">
                        <button className="button primary" type="submit" disabled={communitySponsorsStatus.type === "loading"}>
                          {communitySponsorsStatus.type === "loading" ? "Saving..." : "Add Sponsor"}
                        </button>
                        <button className="button ghost" type="button" onClick={closeCreateSponsorForm}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {communitySponsorsStatus.message ? (
                    <p className={`form-help ${communitySponsorsStatus.type === "error" ? "error" : "muted"}`}>
                      {communitySponsorsStatus.message}
                    </p>
                  ) : null}
                </section>
                <section className="account-card">
                  <div className="account-card__header">
                    <div>
                      <h2>Current Sponsors</h2>
                      <p className="muted">These sponsor cards are loaded from the local community sponsors source file.</p>
                    </div>
                    <button
                      className="button ghost"
                      type="button"
                      onClick={() => void loadCommunitySponsors()}
                      disabled={loadingCommunitySponsors}
                    >
                      {loadingCommunitySponsors ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                  {loadingCommunitySponsors ? <p className="muted">Loading sponsors...</p> : null}
                  {!loadingCommunitySponsors && communitySponsors.length === 0 ? (
                    <p className="muted">No sponsors found.</p>
                  ) : null}
                  {!loadingCommunitySponsors && communitySponsors.length > 0 ? (
                    <div className="event-list admin-scroll-panel">
                      {communitySponsors.map((sponsor) => {
                        const isExpanded = expandedCommunitySponsorCards[sponsor.id] || editingSponsorId === sponsor.id;

                        return (
                          <article key={sponsor.id} className="event-card-simple">
                            <div className="event-card__header">
                              <h3>{sponsor.name}</h3>
                              {editingSponsorId !== sponsor.id ? (
                                <button
                                  className="button ghost"
                                  type="button"
                                  onClick={() => toggleCommunitySponsorCard(sponsor.id)}
                                >
                                  {isExpanded ? "Collapse" : "Expand"}
                                </button>
                              ) : null}
                            </div>
                            {isExpanded ? (
                              <>
                                <div className="register-form-grid" style={{ alignItems: "center", marginTop: 12 }}>
                                  <div
                                    style={{
                                      width: "100%",
                                      maxWidth: 160,
                                      aspectRatio: "1 / 1",
                                      overflow: "hidden",
                                      borderRadius: 18,
                                      border: "1px solid var(--border)",
                                      backgroundColor: "rgba(255, 255, 255, 0.04)",
                                      backgroundImage: `url(${sponsor.image})`,
                                      backgroundPosition: "center",
                                      backgroundRepeat: "no-repeat",
                                      backgroundSize: "cover",
                                    }}
                                    role="img"
                                    aria-label={sponsor.name}
                                  />
                                  <div style={{ display: "grid", gap: 10 }}>
                                    <p className="muted" style={{ margin: 0 }}>
                                      Section: {sponsorPlacementLabel(sponsor.placement)}
                                    </p>
                                    {sponsor.websiteUrl ? <p className="muted" style={{ margin: 0 }}>Website: {sponsor.websiteUrl}</p> : null}
                                    {sponsor.instagramUrl ? <p className="muted" style={{ margin: 0 }}>Instagram: {sponsor.instagramUrl}</p> : null}
                                    <p className="muted" style={{ margin: 0, whiteSpace: "pre-line" }}>{sponsor.description}</p>
                                  </div>
                                </div>
                                <div className="cta-row" style={{ marginTop: 16 }}>
                                  <button className="button ghost" type="button" onClick={() => startEditingCommunitySponsor(sponsor)}>
                                    {editingSponsorId === sponsor.id ? "Editing" : "Edit"}
                                  </button>
                                  <button
                                    className="button ghost"
                                    type="button"
                                    onClick={() => void handleDeleteCommunitySponsor(sponsor)}
                                  >
                                    Delete
                                  </button>
                                </div>
                                {editingSponsorId === sponsor.id ? (
                                  <div className="register-form" style={{ marginTop: 12 }}>
                                    <div className="register-form-grid">
                                      <div className="form-control">
                                        <label htmlFor={`edit-community-sponsor-name-${sponsor.id}`}>Business Name *</label>
                                        <input
                                          id={`edit-community-sponsor-name-${sponsor.id}`}
                                          value={communitySponsorEditForm.name}
                                          onChange={(e) => updateCommunitySponsorEdit("name", e.target.value)}
                                          required
                                        />
                                      </div>
                                <div className="form-control">
                                  <label htmlFor={`edit-community-sponsor-image-${sponsor.id}`}>Image URL *</label>
                                  <input
                                    id={`edit-community-sponsor-image-${sponsor.id}`}
                                    value={communitySponsorEditForm.image}
                                          onChange={(e) => updateCommunitySponsorEdit("image", e.target.value)}
                                          required
                                        />
                                        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                          <label
                                            className="button ghost"
                                            htmlFor={`edit-community-sponsor-image-upload-${sponsor.id}`}
                                            style={{ padding: "0.45rem 0.75rem" }}
                                          >
                                            {uploadingEditSponsorImageId === sponsor.id ? "Uploading..." : "Upload a sponsor image"}
                                          </label>
                                          <input
                                            id={`edit-community-sponsor-image-upload-${sponsor.id}`}
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => void handleEditCommunitySponsorImageUpload(sponsor.id, e)}
                                            disabled={uploadingEditSponsorImageId === sponsor.id}
                                            style={{ display: "none" }}
                                    />
                                  </div>
                                </div>
                                <div className="form-control">
                                  <label htmlFor={`edit-community-sponsor-placement-${sponsor.id}`}>Sponsor Section *</label>
                                  <select
                                    id={`edit-community-sponsor-placement-${sponsor.id}`}
                                    value={communitySponsorEditForm.placement}
                                    onChange={(e) => updateCommunitySponsorEdit("placement", e.target.value as CommunitySponsorPlacement)}
                                  >
                                    {COMMUNITY_SPONSOR_PLACEMENT_OPTIONS.map((placement) => (
                                      <option key={placement} value={placement}>
                                        {sponsorPlacementLabel(placement)}
                                      </option>
                                    ))}
                                  </select>
                                  <p className="form-help muted">Top Sponsors is limited to two sponsors and powers the split layout on the Community page.</p>
                                </div>
                              </div>
                              <div className="form-control">
                                <label htmlFor={`edit-community-sponsor-description-${sponsor.id}`}>Description *</label>
                                      <textarea
                                        id={`edit-community-sponsor-description-${sponsor.id}`}
                                        value={communitySponsorEditForm.description}
                                        onChange={(e) => updateCommunitySponsorEdit("description", e.target.value)}
                                        rows={5}
                                        required
                                      />
                                    </div>
                                    <div className="register-form-grid">
                                      <div className="form-control">
                                        <label htmlFor={`edit-community-sponsor-website-${sponsor.id}`}>Website URL</label>
                                        <input
                                          id={`edit-community-sponsor-website-${sponsor.id}`}
                                          value={communitySponsorEditForm.websiteUrl}
                                          onChange={(e) => updateCommunitySponsorEdit("websiteUrl", e.target.value)}
                                          placeholder="https://example.com"
                                        />
                                      </div>
                                      <div className="form-control">
                                        <label htmlFor={`edit-community-sponsor-instagram-${sponsor.id}`}>Instagram URL</label>
                                        <input
                                          id={`edit-community-sponsor-instagram-${sponsor.id}`}
                                          value={communitySponsorEditForm.instagramUrl}
                                          onChange={(e) => updateCommunitySponsorEdit("instagramUrl", e.target.value)}
                                          placeholder="https://instagram.com/yourhandle"
                                        />
                                      </div>
                                    </div>
                                    {communitySponsorEditForm.image ? (
                                      <div className="form-control">
                                        <label>Preview</label>
                                        <div
                                          style={{
                                            width: 140,
                                            height: 140,
                                            overflow: "hidden",
                                            borderRadius: 16,
                                            border: "1px solid var(--border)",
                                            backgroundColor: "rgba(255, 255, 255, 0.04)",
                                            backgroundImage: `url(${communitySponsorEditForm.image})`,
                                            backgroundPosition: "center",
                                            backgroundRepeat: "no-repeat",
                                            backgroundSize: "cover",
                                          }}
                                          role="img"
                                          aria-label={communitySponsorEditForm.name || "Sponsor preview"}
                                          aria-hidden={!communitySponsorEditForm.name}
                                        />
                                      </div>
                                    ) : null}
                                    <div className="cta-row">
                                      <button
                                        className="button primary"
                                        type="button"
                                        onClick={() => void handleSaveCommunitySponsor(sponsor.id)}
                                        disabled={communitySponsorsStatus.type === "loading"}
                                      >
                                        {communitySponsorsStatus.type === "loading" ? "Saving..." : "Save"}
                                      </button>
                                      <button className="button ghost" type="button" onClick={cancelEditingCommunitySponsor}>
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
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
            {activeModule === "settings" ? (
              <>
                <section className="account-card">
                  <h2>Settings</h2>
                  <p className="muted">Control site-wide banners and send inbox announcements to site members.</p>
                </section>
                <section className="account-card">
                  <div className="account-card__header">
                    <div>
                      <h2>Home Page Banner</h2>
                      <p className="muted">Show or hide the banner and update the message without editing code.</p>
                    </div>
                    <button className="button ghost" type="button" onClick={() => void loadSiteSettings()} disabled={loadingSiteSettings}>
                      {loadingSiteSettings ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                  <form className="register-form" onSubmit={handleSaveSiteSettings}>
                    <div className="form-control checkbox-control" style={{ justifySelf: "start" }}>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={siteSettingsForm.homeBannerEnabled}
                          onChange={(e) => updateSiteSettings("homeBannerEnabled", e.target.checked)}
                        />
                        <span>Show banner on the home page</span>
                      </label>
                    </div>
                    <div className="form-control">
                      <label htmlFor="settings-home-banner-text">Banner Text</label>
                      <textarea
                        id="settings-home-banner-text"
                        value={siteSettingsForm.homeBannerText}
                        onChange={(e) => updateSiteSettings("homeBannerText", e.target.value)}
                        rows={3}
                        placeholder={DEFAULT_HOME_BANNER_TEXT}
                        required={siteSettingsForm.homeBannerEnabled}
                      />
                      <p className="form-help muted">
                        When enabled, this message appears above the hero section on the home page.
                      </p>
                    </div>
                    <div className="form-control">
                      <label htmlFor="settings-home-banner-button-target">Button Destination</label>
                      <select
                        id="settings-home-banner-button-target"
                        value={siteSettingsForm.homeBannerButtonTarget}
                        onChange={(e) =>
                          setSiteSettingsForm((prev) => ({
                            ...prev,
                            homeBannerButtonTarget: e.target.value as HomeBannerButtonTarget,
                            homeBannerButtonEventId: e.target.value === "event" ? prev.homeBannerButtonEventId : "",
                            homeBannerButtonPageHref: e.target.value === "page" ? prev.homeBannerButtonPageHref : "",
                          }))
                        }
                      >
                        <option value="none">No button</option>
                        <option value="event">Specific event</option>
                        <option value="page">Specific page</option>
                      </select>
                      <p className="form-help muted">
                        The banner button always says Take Me There.
                      </p>
                    </div>
                    {siteSettingsForm.homeBannerButtonTarget === "event" ? (
                      <div className="form-control">
                        <label htmlFor="settings-home-banner-button-event">Choose Event</label>
                        <select
                          id="settings-home-banner-button-event"
                          value={siteSettingsForm.homeBannerButtonEventId}
                          onChange={(e) => updateSiteSettings("homeBannerButtonEventId", e.target.value)}
                          disabled={loadingEvents}
                        >
                          <option value="">{loadingEvents ? "Loading events..." : "Select an event"}</option>
                          {events.map((event) => (
                            <option key={event.id} value={event.id}>
                              {event.title} • {dateLabel(event.start_date, event.end_date)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    {siteSettingsForm.homeBannerButtonTarget === "page" ? (
                      <div className="form-control">
                        <label htmlFor="settings-home-banner-button-page">Choose Page</label>
                        <select
                          id="settings-home-banner-button-page"
                          value={siteSettingsForm.homeBannerButtonPageHref}
                          onChange={(e) => updateSiteSettings("homeBannerButtonPageHref", e.target.value)}
                        >
                          <option value="">Select a page</option>
                          {HOME_BANNER_PAGE_OPTIONS.map((option) => (
                            <option key={option.href} value={option.href}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    <div className="admin-home-banner-preview">
                      <p className="admin-home-banner-preview__heading">
                        Preview
                        <span>{siteSettingsForm.homeBannerEnabled ? "Visible" : "Hidden"}</span>
                      </p>
                      <div className={`admin-home-banner-preview__bar${siteSettingsForm.homeBannerEnabled ? "" : " is-muted"}`}>
                        <span className="admin-home-banner-preview__label">Announcement</span>
                        <p className="admin-home-banner-preview__text">
                          {siteSettingsForm.homeBannerText.trim() || "Banner text will appear here."}
                        </p>
                        {(siteSettingsForm.homeBannerButtonTarget === "event" && siteSettingsForm.homeBannerButtonEventId) ||
                        (siteSettingsForm.homeBannerButtonTarget === "page" && siteSettingsForm.homeBannerButtonPageHref) ? (
                          <span className="admin-home-banner-preview__button">Take Me There</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="cta-row">
                      <button className="button primary" type="submit" disabled={siteSettingsStatus.type === "loading"}>
                        {siteSettingsStatus.type === "loading" ? "Saving..." : "Save Settings"}
                      </button>
                    </div>
                  </form>
                  {siteSettingsStatus.message ? (
                    <p className={`form-help ${siteSettingsStatus.type === "error" ? "error" : "muted"}`}>
                      {siteSettingsStatus.message}
                    </p>
                  ) : null}
                </section>
                <section className="account-card">
                  <div className="account-card__header">
                    <div>
                      <h2>Inbox Announcements</h2>
                      <p className="muted">Send announcements to everyone on the site or a selected list of members.</p>
                    </div>
                    <button className="button ghost" type="button" onClick={() => void loadUsers()} disabled={loadingUsers}>
                      {loadingUsers ? "Refreshing..." : "Refresh Members"}
                    </button>
                  </div>
                  <form className="register-form" onSubmit={handleSendAnnouncement}>
                    <div className="form-control">
                      <label htmlFor="announcement-audience">Audience</label>
                      <select
                        id="announcement-audience"
                        value={announcementForm.audience}
                        onChange={(event) =>
                          setAnnouncementForm((prev) => ({
                            ...prev,
                            audience: event.target.value as InboxAnnouncementAudience,
                            recipientIds: event.target.value === "selected_players" ? prev.recipientIds : [],
                          }))
                        }
                      >
                        {INBOX_ANNOUNCEMENT_AUDIENCE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option === "all_players" ? `Everyone on Site (${announcementRecipientDirectory.length})` : "Specific Members"}
                          </option>
                        ))}
                      </select>
                    </div>
                    {announcementForm.audience === "selected_players" ? (
                      <>
                        <div className="admin-user-search">
                          <label htmlFor="announcement-player-search">Find Members</label>
                          <input
                            id="announcement-player-search"
                            type="search"
                            placeholder="Search by name or sport"
                            value={announcementRecipientSearch}
                            onChange={(event) => setAnnouncementRecipientSearch(event.target.value)}
                          />
                        </div>
                        <div className="admin-recipient-picker">
                          <div>
                            <p className="list__title">Selected Members</p>
                            {selectedAnnouncementPlayers.length > 0 ? (
                              <div className="admin-recipient-pill-list">
                                {selectedAnnouncementPlayers.map((player) => (
                                  <button
                                    key={player.id}
                                    className="admin-recipient-pill"
                                    type="button"
                                    onClick={() => removeAnnouncementRecipient(player.id)}
                                  >
                                    <span>{player.name}</span>
                                    <span aria-hidden>×</span>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="muted">No members selected yet.</p>
                            )}
                          </div>
                          <div>
                            <p className="list__title">Matching Members</p>
                            {loadingUsers ? <p className="muted">Loading members...</p> : null}
                            {!loadingUsers && filteredAnnouncementPlayers.length === 0 ? (
                              <p className="muted">No members match that search.</p>
                            ) : null}
                            {!loadingUsers && filteredAnnouncementPlayers.length > 0 ? (
                              <div className="admin-recipient-option-list">
                                {filteredAnnouncementPlayers.map((player) => (
                                  <button
                                    key={player.id}
                                    className="admin-recipient-option"
                                    type="button"
                                    onClick={() => addAnnouncementRecipient(player.id)}
                                  >
                                    <strong>{player.name}</strong>
                                    <span>{Array.isArray(player.sports) && player.sports.length > 0 ? player.sports.join(", ") : "Member"}</span>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="form-help muted">
                        This sends the message to every profile on the site with an inbox.
                      </p>
                    )}
                    <div className="form-control">
                      <label htmlFor="announcement-title">Title</label>
                      <input
                        id="announcement-title"
                        type="text"
                        value={announcementForm.title}
                        onChange={(event) => updateAnnouncementForm("title", event.target.value)}
                        placeholder="League update, schedule change, payment reminder..."
                        required
                      />
                    </div>
                    <div className="form-control">
                      <label htmlFor="announcement-message">Message</label>
                      <textarea
                        id="announcement-message"
                        value={announcementForm.message}
                        onChange={(event) => updateAnnouncementForm("message", event.target.value)}
                        rows={5}
                        placeholder="Write the announcement that should appear in each member's inbox."
                        required
                      />
                    </div>
                    {usersError ? <p className="form-help error">{usersError}</p> : null}
                    {announcementStatus.message ? (
                      <p className={`form-help ${announcementStatus.type === "error" ? "error" : "muted"}`}>
                        {announcementStatus.message}
                      </p>
                    ) : null}
                    <div className="cta-row">
                      <button className="button primary" type="submit" disabled={announcementStatus.type === "loading"}>
                        {announcementStatus.type === "loading" ? "Sending..." : "Send Announcement"}
                      </button>
                    </div>
                  </form>
                </section>
              </>
            ) : null}
            {activeModule === "registrations" ? (
              <>
                <section className="account-card">
                  <h2>Event Registrations</h2>
                  <p className="muted">See who signed up for events, waitlists, and Sunday League team registration.</p>
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
                                <p className="muted">Type: {row.type_label}</p>
                                <p className="muted">User: {row.user_name}</p>
                                {row.registration_name ? <p className="muted">Team: {row.registration_name}</p> : null}
                                <p className="muted">Email: {row.user_email}</p>
                                {row.user_phone ? <p className="muted">Phone: {row.user_phone}</p> : null}
                                <p className="muted">Paid: {row.paid_amount_cents ? formatEventPaymentAmount(row.paid_amount_cents) : "No payment"}</p>
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
                              <p className="muted">Type: {row.type_label}</p>
                              {row.registration_name ? <p className="muted">Team: {row.registration_name}</p> : null}
                              <p className="muted">Email: {row.user_email}</p>
                              {row.user_phone ? <p className="muted">Phone: {row.user_phone}</p> : null}
                              <p className="muted">Paid: {row.paid_amount_cents ? formatEventPaymentAmount(row.paid_amount_cents) : "No payment"}</p>
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
                          eventTitle: selectedRegistrationSubmission.registration_name
                            ? `${selectedRegistrationSubmission.event_title} • ${selectedRegistrationSubmission.registration_name}`
                            : selectedRegistrationSubmission.event_title,
                          submittedAt: selectedRegistrationSubmission.submitted_at,
                          name: selectedRegistrationSubmission.user_name,
                          email: selectedRegistrationSubmission.user_email,
                          phone: selectedRegistrationSubmission.user_phone,
                          paymentSummary: selectedRegistrationSubmission.paid_amount_cents
                            ? `Paid ${formatEventPaymentAmount(selectedRegistrationSubmission.paid_amount_cents)}`
                            : "No payment",
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
                              className={`button ${manageForm.role === "partner" ? "primary" : "ghost"}`}
                              onClick={() => setManageForm((prev) => ({ ...prev, role: "partner" }))}
                            >
                              Partner
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
                            {message.communications_opt_in !== null && message.communications_opt_in !== undefined ? (
                              <p className="muted">Communications: {message.communications_opt_in ? "Opted in" : "Opted out"}</p>
                            ) : null}
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
                                  <Image
                                    src={flyer.flyer_image_url}
                                    alt={`${event.title} flyer`}
                                    width={840}
                                    height={1188}
                                    sizes="(max-width: 720px) 100vw, 420px"
                                    style={{ width: "100%", maxWidth: 420, height: "auto", borderRadius: 12, border: "1px solid var(--border)" }}
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
