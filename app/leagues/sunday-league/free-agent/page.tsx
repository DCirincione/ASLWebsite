"use client";
import "../sunday-league.css";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { HistoryBackButton } from "@/components/history-back-button";
import { PageShell } from "@/components/page-shell";
import {
  ALDRICH_COMMUNICATIONS_LABEL,
  getAldrichCommunicationsPreferenceFromMetadata,
} from "@/lib/aldrich-communications";
import { calculateAgeFromDateString } from "@/lib/profile-age";
import {
  SUNDAY_LEAGUE_AVAILABILITY_OPTIONS,
  SUNDAY_LEAGUE_DOMINANT_FOOT_OPTIONS,
  SUNDAY_LEAGUE_EXPERIENCE_LEVEL_OPTIONS,
  SUNDAY_LEAGUE_POSITION_GROUP_OPTIONS,
  SUNDAY_LEAGUE_SKILL_LEVEL_OPTIONS,
  buildSundayLeagueFreeAgentMetadataValue,
  buildSundayLeagueFreeAgentPublicBio,
  getSundayLeagueFreeAgentMetadata,
  getSundayLeagueFreeAgentSkillRating,
  type SundayLeagueAvailability,
  type SundayLeagueDominantFoot,
  type SundayLeagueExperienceLevel,
  type SundayLeaguePositionGroup,
  type SundayLeagueSkillLevelLabel,
} from "@/lib/sunday-league-free-agent";
import { supabase } from "@/lib/supabase/client";
import type { Profile, ProfileInsert, SundayLeagueTeamMember } from "@/lib/supabase/types";

type Status = { type: "idle" | "loading" | "success" | "error"; message?: string };
type SessionUser = { id: string; email: string | null; user_metadata?: unknown };
type FreeAgentProfile = Pick<
  Profile,
  "id" | "name" | "role" | "positions" | "skill_level" | "sports" | "about"
> & {
  age?: string | null;
};
type FreeAgentRow = Pick<
  SundayLeagueTeamMember,
  "id" | "player_user_id" | "team_id" | "status" | "source" | "invite_name" | "invite_email"
>;

type FreeAgentFormState = {
  name: string;
  phone_number: string;
  email: string;
  password: string;
  age: string;
  preferred_positions: string;
  position_groups: SundayLeaguePositionGroup[];
  secondary_position: string;
  height_cm: string;
  weight_lbs: string;
  dominant_foot: SundayLeagueDominantFoot | "";
  skill_level_label: SundayLeagueSkillLevelLabel | "";
  experience_level: SundayLeagueExperienceLevel | "";
  strengths: string;
  weaknesses: string;
  play_style: string;
  sunday_availability: SundayLeagueAvailability | "";
  known_conflicts: string;
  communications_opt_in: boolean;
};

const defaultFormState: FreeAgentFormState = {
  name: "",
  phone_number: "",
  email: "",
  password: "",
  age: "",
  preferred_positions: "",
  position_groups: [],
  secondary_position: "",
  height_cm: "",
  weight_lbs: "",
  dominant_foot: "",
  skill_level_label: "",
  experience_level: "",
  strengths: "",
  weaknesses: "",
  play_style: "",
  sunday_availability: "",
  known_conflicts: "",
  communications_opt_in: true,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseArray = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const unique = (value: string[]) => Array.from(new Set(value.filter(Boolean)));

const asTrimmedString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
};

const getMetadataString = (value: unknown, keys: string[]) => {
  if (!isRecord(value)) {
    return null;
  }

  for (const key of keys) {
    const normalized = asTrimmedString(value[key]);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const toTitleCase = (value: string) =>
  value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const getNameFromEmail = (value?: string | null) => {
  const normalized = asTrimmedString(value)?.toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    return null;
  }

  const [localPart] = normalized.split("@");
  const withoutTag = localPart.split("+")[0] ?? localPart;
  if (!/[._-]/.test(withoutTag)) {
    return null;
  }

  const cleaned = withoutTag
    .replace(/[._-]+/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.split(" ").length < 2) {
    return null;
  }

  return toTitleCase(cleaned);
};

const getMetadataFullName = (value: unknown) => {
  const fullName = getMetadataString(value, ["full_name"]);
  if (fullName) {
    return fullName;
  }

  const givenName = getMetadataString(value, ["given_name", "first_name"]);
  const familyName = getMetadataString(value, ["family_name", "last_name"]);
  if (givenName && familyName) {
    return `${givenName} ${familyName}`;
  }

  return getMetadataString(value, ["name", "display_name"]);
};

const isAbbreviatedName = (value?: string | null) => {
  const normalized = asTrimmedString(value);
  if (!normalized) {
    return false;
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return false;
  }

  return words.some((word, index) => index > 0 && word.replace(/\./g, "").length === 1);
};

const getPreferredStoredName = (options: Array<string | null | undefined>, email?: string | null) => {
  const candidates = options.map((option) => asTrimmedString(option)).filter((option): option is string => Boolean(option));
  const firstFullName = candidates.find((candidate) => !isAbbreviatedName(candidate));
  const inferredEmailName = getNameFromEmail(email);

  if (firstFullName) {
    return firstFullName;
  }

  return inferredEmailName ?? candidates[0] ?? null;
};

const getAgeFromDateLikeString = (value?: string | null) => {
  const normalized = asTrimmedString(value);
  if (!normalized) {
    return null;
  }

  const isoDateMatch = normalized.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDateMatch) {
    return calculateAgeFromDateString(isoDateMatch)?.toString() ?? null;
  }

  const slashDateMatch = normalized.match(/\d{4}\/\d{2}\/\d{2}/)?.[0];
  if (slashDateMatch) {
    return calculateAgeFromDateString(slashDateMatch.replace(/\//g, "-"))?.toString() ?? null;
  }

  const parsedDate = new Date(normalized);
  if (!Number.isNaN(parsedDate.getTime())) {
    return calculateAgeFromDateString(parsedDate.toISOString().slice(0, 10))?.toString() ?? null;
  }

  return null;
};

const getProfileAgeForForm = (value?: string | null) => {
  const normalized = asTrimmedString(value);
  if (!normalized) {
    return null;
  }

  const calculatedAge = getAgeFromDateLikeString(normalized);
  return calculatedAge ?? normalized;
};

const getSkillLevelLabelFromRating = (value?: number | null): SundayLeagueSkillLevelLabel | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value >= 9) {
    return "High Level";
  }
  if (value >= 7) {
    return "Advanced";
  }
  if (value >= 4) {
    return "Intermediate";
  }

  return "Beginner";
};

const getPositionGroupsFromPositions = (value?: string[] | null): SundayLeaguePositionGroup[] => {
  const normalizedPositions = (value ?? []).map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  return SUNDAY_LEAGUE_POSITION_GROUP_OPTIONS.filter((option) => normalizedPositions.includes(option.toLowerCase()));
};

type FreeAgentSelectFieldProps = {
  id: string;
  label: ReactNode;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  placeholder?: string;
};

function FreeAgentSelectField({
  id,
  label,
  value,
  options,
  onChange,
  placeholder = "Select",
}: FreeAgentSelectFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = `${id}-listbox`;
  const selectedLabel = value || placeholder;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleButtonKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsOpen(true);
    }
  };

  const handleOptionSelect = (nextValue: string) => {
    onChange(nextValue);
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div className="form-control sunday-league-select-field">
      <span>{label}</span>
      <div ref={rootRef} className="sunday-league-select-field__control">
        <button
          id={id}
          ref={buttonRef}
          className={`sunday-league-select-field__trigger${isOpen ? " is-open" : ""}${value ? "" : " is-placeholder"}`}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          onClick={() => setIsOpen((current) => !current)}
          onKeyDown={handleButtonKeyDown}
        >
          <span>{selectedLabel}</span>
        </button>

        {isOpen ? (
          <div id={listboxId} className="sunday-league-select-field__menu" role="listbox" aria-labelledby={id}>
            <button
              className={`sunday-league-select-field__option${value ? "" : " is-selected"}`}
              type="button"
              role="option"
              aria-selected={!value}
              onClick={() => handleOptionSelect("")}
            >
              {placeholder}
            </button>
            {options.map((option) => (
              <button
                key={option}
                className={`sunday-league-select-field__option${value === option ? " is-selected" : ""}`}
                type="button"
                role="option"
                aria-selected={value === option}
                onClick={() => handleOptionSelect(option)}
              >
                {option}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function SundayLeagueFreeAgentPage() {
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<FreeAgentProfile | null>(null);
  const [freeAgentRow, setFreeAgentRow] = useState<FreeAgentRow | null>(null);
  const [hasAcceptedTeam, setHasAcceptedTeam] = useState(false);
  const [isCaptain, setIsCaptain] = useState(false);
  const [loadingState, setLoadingState] = useState<"loading" | "ready">("loading");
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const [form, setForm] = useState<FreeAgentFormState>(defaultFormState);

  useEffect(() => {
    const loadPageState = async () => {
      if (!supabase) {
        setLoadingState("ready");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const currentUser = sessionData.session?.user ?? null;
      const nextSessionUser = currentUser
        ? {
            id: currentUser.id,
            email: currentUser.email?.trim().toLowerCase() ?? null,
            user_metadata: currentUser.user_metadata,
          }
        : null;

      setSessionUser(nextSessionUser);

      if (!nextSessionUser) {
        setLoadingState("ready");
        return;
      }

      const [profileResponse, captainResponse, acceptedMembershipResponse, freeAgentResponse] = await Promise.all([
        supabase
          .from("profiles")
          .select("*")
          .eq("id", nextSessionUser.id)
          .maybeSingle(),
        supabase.from("sunday_league_teams").select("id").eq("user_id", nextSessionUser.id).limit(1),
        supabase.from("sunday_league_team_members").select("id,team_id").eq("player_user_id", nextSessionUser.id).eq("status", "accepted"),
        supabase
          .from("sunday_league_team_members")
          .select("id,player_user_id,team_id,status,source,invite_name,invite_email")
          .eq("player_user_id", nextSessionUser.id)
          .eq("source", "free_agent")
          .eq("status", "free_agent")
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      const nextProfile = (profileResponse.data ?? null) as FreeAgentProfile | null;
      const nextFreeAgentRow = ((freeAgentResponse.data ?? [])[0] ?? null) as FreeAgentRow | null;
      const nextHasAcceptedTeam = ((acceptedMembershipResponse.data ?? []) as Array<{ team_id?: string | null }>).some(
        (membership) => Boolean(membership.team_id),
      );
      const nextIsCaptain = Boolean((captainResponse.data ?? []).length);
      const metadata = getSundayLeagueFreeAgentMetadata(nextSessionUser.user_metadata);
      const profilePositionGroups = getPositionGroupsFromPositions(nextProfile?.positions);
      const storedName = getPreferredStoredName(
        [
          getMetadataFullName(nextSessionUser.user_metadata),
          nextProfile?.name?.trim(),
          nextFreeAgentRow?.invite_name?.trim(),
        ],
        nextSessionUser.email,
      );
      const storedPhone =
        metadata.phone_number
        ?? getMetadataString(nextSessionUser.user_metadata, ["phone_number", "phone"]);
      const storedEmail =
        nextSessionUser.email
        || nextFreeAgentRow?.invite_email?.trim()
        || getMetadataString(nextSessionUser.user_metadata, ["email"])
        || "";
      const storedAge =
        metadata.age
        ?? getProfileAgeForForm(nextProfile?.age)
        ?? getAgeFromDateLikeString(
          getMetadataString(nextSessionUser.user_metadata, ["birthdate", "birthday", "date_of_birth", "dob"]),
        )
        ?? getMetadataString(nextSessionUser.user_metadata, ["age"]);
      const storedPositionGroups =
        metadata.position_groups && metadata.position_groups.length > 0
          ? metadata.position_groups
          : profilePositionGroups.length > 0
            ? profilePositionGroups
            : null;
      const storedSkillLevel = metadata.skill_level_label ?? getSkillLevelLabelFromRating(nextProfile?.skill_level);

      setProfile(nextProfile);
      setFreeAgentRow(nextFreeAgentRow);
      setHasAcceptedTeam(nextHasAcceptedTeam);
      setIsCaptain(nextIsCaptain);
      setForm((prev) => ({
        ...prev,
        name: storedName ?? prev.name,
        phone_number: storedPhone ?? prev.phone_number,
        email: storedEmail || prev.email,
        age: storedAge ?? prev.age,
        preferred_positions: metadata.preferred_positions ?? nextProfile?.positions?.join(", ") ?? prev.preferred_positions,
        position_groups: storedPositionGroups ?? prev.position_groups,
        secondary_position: metadata.secondary_position ?? prev.secondary_position,
        height_cm: metadata.height_cm ?? prev.height_cm,
        weight_lbs: metadata.weight_lbs ?? prev.weight_lbs,
        dominant_foot: metadata.dominant_foot ?? prev.dominant_foot,
        skill_level_label: storedSkillLevel ?? prev.skill_level_label,
        experience_level: metadata.experience_level ?? prev.experience_level,
        strengths: metadata.strengths ?? prev.strengths,
        weaknesses: metadata.weaknesses ?? prev.weaknesses,
        play_style: metadata.play_style ?? prev.play_style,
        sunday_availability: metadata.sunday_availability ?? prev.sunday_availability,
        known_conflicts: metadata.known_conflicts ?? prev.known_conflicts,
        communications_opt_in: getAldrichCommunicationsPreferenceFromMetadata(nextSessionUser.user_metadata, true),
      }));
      setLoadingState("ready");
    };

    void loadPageState();
  }, []);

  const isBlocked = isCaptain || hasAcceptedTeam;
  const submitLabel = useMemo(() => {
    if (status.type === "loading") {
      return sessionUser ? "Saving..." : "Creating...";
    }

    if (freeAgentRow) {
      return "Update Free Agent Card";
    }

    return sessionUser ? "Join Free Agent Portal" : "Create Account and Join";
  }, [freeAgentRow, sessionUser, status.type]);

  const updateForm = <Key extends keyof FreeAgentFormState>(key: Key, value: FreeAgentFormState[Key]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const togglePositionGroup = (value: SundayLeaguePositionGroup) => {
    setForm((prev) => ({
      ...prev,
      position_groups: prev.position_groups.includes(value)
        ? prev.position_groups.filter((item) => item !== value)
        : [...prev.position_groups, value],
    }));
  };

  const upsertFreeAgentRow = async (userId: string, email: string | null, name: string) => {
    if (!supabase) {
      return { error: new Error("Supabase is not configured."), row: null };
    }

    const payload = {
      team_id: null,
      player_user_id: userId,
      invite_email: email,
      invite_name: name,
      status: "free_agent" as const,
      source: "free_agent" as const,
      role: "player" as const,
    };

    const response = freeAgentRow
      ? await supabase
          .from("sunday_league_team_members")
          .update(payload)
          .eq("id", freeAgentRow.id)
          .select("id,player_user_id,team_id,status,source")
          .single()
      : await supabase
          .from("sunday_league_team_members")
          .insert(payload)
          .select("id,player_user_id,team_id,status,source")
          .single();

    return {
      error: response.error,
      row: (response.data ?? null) as FreeAgentRow | null,
    };
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!supabase) {
      setStatus({ type: "error", message: "Supabase is not configured." });
      return;
    }

    if (isBlocked) {
      setStatus({
        type: "error",
        message: isCaptain
          ? "Captains already manage a team and cannot also sign up as a free agent."
          : "Players already on a Sunday League roster cannot also sign up as free agents.",
      });
      return;
    }

    const trimmedName = form.name.trim();
    const normalizedEmail = form.email.trim().toLowerCase();

    if (!trimmedName) {
      setStatus({ type: "error", message: "Full Name is required." });
      return;
    }
    if (!form.phone_number.trim()) {
      setStatus({ type: "error", message: "Phone Number is required." });
      return;
    }
    if (!sessionUser && !normalizedEmail) {
      setStatus({ type: "error", message: "Email Address is required." });
      return;
    }
    if (!sessionUser && form.password.trim().length < 6) {
      setStatus({ type: "error", message: "Use a password with at least 6 characters." });
      return;
    }
    if (!form.age.trim()) {
      setStatus({ type: "error", message: "Age is required." });
      return;
    }
    if (!form.preferred_positions.trim() && form.position_groups.length === 0) {
      setStatus({ type: "error", message: "Add at least one preferred position." });
      return;
    }
    if (!form.skill_level_label) {
      setStatus({ type: "error", message: "Skill Level is required." });
      return;
    }
    if (!form.experience_level) {
      setStatus({ type: "error", message: "Experience Level is required." });
      return;
    }
    if (!form.sunday_availability) {
      setStatus({ type: "error", message: "Sunday availability is required." });
      return;
    }

    setStatus({ type: "loading" });

    const metadata = {
      age: form.age.trim(),
      phone_number: form.phone_number.trim(),
      preferred_positions: form.preferred_positions.trim() || null,
      position_groups: form.position_groups,
      secondary_position: form.secondary_position.trim() || null,
      height_cm: form.height_cm.trim() || null,
      weight_lbs: form.weight_lbs.trim() || null,
      dominant_foot: form.dominant_foot || null,
      skill_level_label: form.skill_level_label || null,
      experience_level: form.experience_level || null,
      strengths: form.strengths.trim() || null,
      weaknesses: form.weaknesses.trim() || null,
      play_style: form.play_style.trim() || null,
      sunday_availability: form.sunday_availability || null,
      known_conflicts: form.known_conflicts.trim() || null,
    } as const;

    let nextUserId = sessionUser?.id ?? null;
    let nextUserEmail = sessionUser?.email ?? normalizedEmail;

    if (!nextUserId) {
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: form.password,
        options: {
          data: {
            name: trimmedName,
            settings: {
              email_community_updates: form.communications_opt_in,
            },
            ...buildSundayLeagueFreeAgentMetadataValue(metadata),
          },
        },
      });

      if (error || !data.user) {
        setStatus({ type: "error", message: error?.message ?? "Unable to create your account." });
        return;
      }

      nextUserId = data.user.id;
      nextUserEmail = data.user.email?.trim().toLowerCase() ?? normalizedEmail;
      setSessionUser({
        id: nextUserId,
        email: nextUserEmail,
        user_metadata: data.user.user_metadata,
      });
    } else {
      const currentMetadata = isRecord(sessionUser?.user_metadata) ? sessionUser.user_metadata : {};
      const currentSettings = isRecord(currentMetadata.settings) ? currentMetadata.settings : {};

      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          ...currentMetadata,
          ...buildSundayLeagueFreeAgentMetadataValue(metadata),
          name: trimmedName,
          settings: {
            ...currentSettings,
            email_community_updates: form.communications_opt_in,
          },
        },
      });

      if (metadataError) {
        setStatus({ type: "error", message: metadataError.message });
        return;
      }
    }

    if (!nextUserId) {
      setStatus({ type: "error", message: "Could not determine your account." });
      return;
    }

    const publicPositions = unique([
      ...parseArray(form.preferred_positions),
      ...form.position_groups,
      form.secondary_position.trim(),
    ]);

    const nextProfilePayload: ProfileInsert = {
      id: nextUserId,
      name: trimmedName,
      role: profile?.role && profile.role !== "player" ? profile.role : "player",
      positions: publicPositions,
      skill_level: getSundayLeagueFreeAgentSkillRating(form.skill_level_label),
      sports: unique([...(profile?.sports ?? []), "Soccer"]),
      about: buildSundayLeagueFreeAgentPublicBio(metadata, profile?.about ?? null),
    };

    const { error: profileError } = await supabase.from("profiles").upsert(nextProfilePayload);
    if (profileError) {
      setStatus({ type: "error", message: profileError.message });
      return;
    }

    const nextProfileState: FreeAgentProfile = {
      id: nextUserId,
      name: nextProfilePayload.name,
      role: nextProfilePayload.role ?? null,
      positions: nextProfilePayload.positions ?? null,
      skill_level: nextProfilePayload.skill_level ?? null,
      sports: nextProfilePayload.sports ?? null,
      about: nextProfilePayload.about ?? null,
      age: profile?.age ?? null,
    };

    const freeAgentResult = await upsertFreeAgentRow(nextUserId, nextUserEmail, trimmedName);
    if (freeAgentResult.error || !freeAgentResult.row) {
      setStatus({ type: "error", message: freeAgentResult.error?.message ?? "Could not save your free agent card." });
      return;
    }

    setProfile(nextProfileState);
    setFreeAgentRow(freeAgentResult.row);
    setForm((prev) => ({ ...prev, email: nextUserEmail ?? prev.email, password: "" }));
    setStatus({
      type: "success",
      message: freeAgentRow
        ? "Your free agent card was updated. Captains will see the latest version in the portal."
        : "Your free agent card is live. Captains can now view it in the portal and invite you to a team.",
    });
  };

  return (
    <PageShell>
      <div style={{ paddingTop: 16 }}>
        <HistoryBackButton label="← Back" fallbackHref="/leagues/sunday-league" />
      </div>

      <section className="section sunday-league-flow-page">
        <div className="sunday-league-stack" style={{ gap: 20 }}>
          <div className="sunday-league-team-portal__heading">
            <p className="eyebrow">Sunday League</p>
            <h1>Free Agent Signup</h1>
            <p className="muted">
              Fill out your player card so captains can browse your details in the Sunday League free agent portal and invite you to a roster.
            </p>
          </div>

          <article className="sunday-league-flow-summary__card">
            <div className="sunday-league-stack" style={{ gap: 14 }}>
              <div className="sunday-league-panel-box sunday-league-panel-box--compact">
                <h3>How This Works</h3>
                <p>
                  Free agents stay unattached to any team until a captain invites them and they accept. Captains can view your player card, open your full details, and invite you directly from their team portal.
                </p>
                <p className="muted" style={{ marginBottom: 0 }}>
                  {freeAgentRow
                    ? "You already have a live free agent card. Submit again any time to refresh it."
                    : "Submit this once and you will appear in the captain free agent portal."}
                </p>
              </div>

              {loadingState === "loading" ? <p className="muted">Loading free agent form...</p> : null}

              {loadingState === "ready" && isBlocked ? (
                <div className="sunday-league-panel-box sunday-league-panel-box--compact">
                  <h3>Unavailable</h3>
                  <p>
                    {isCaptain
                      ? "Captains already manage a Sunday League team and cannot also be listed as a free agent."
                      : "You are already on a Sunday League roster, so your player card cannot also be listed as a free agent."}
                  </p>
                  <div className="sunday-league-inline-actions">
                    <Link className="button primary" href="/account/team">
                      Team Portal
                    </Link>
                    <Link className="button ghost" href="/leagues/sunday-league">
                      Sunday League Hub
                    </Link>
                  </div>
                </div>
              ) : null}

              {loadingState === "ready" && !isBlocked ? (
                <form className="sunday-league-team-form sunday-league-free-agent-form" onSubmit={handleSubmit}>
                  <div className="sunday-league-panel-box">
                    <h3>Basic Information</h3>
                    <div className="sunday-league-form-grid">
                      <label className="form-control" htmlFor="free-agent-name">
                        <span>
                          Full Name <span className="register-required">*</span>
                        </span>
                        <input
                          id="free-agent-name"
                          value={form.name}
                          onChange={(event) => updateForm("name", event.target.value)}
                          required
                        />
                      </label>

                      <label className="form-control" htmlFor="free-agent-phone">
                        <span>
                          Phone Number <span className="register-required">*</span>
                        </span>
                        <input
                          id="free-agent-phone"
                          type="tel"
                          value={form.phone_number}
                          onChange={(event) => updateForm("phone_number", event.target.value)}
                          required
                        />
                      </label>

                      <label className="form-control" htmlFor="free-agent-email">
                        <span>
                          Email Address <span className="register-required">*</span>
                        </span>
                        <input
                          id="free-agent-email"
                          type="email"
                          value={form.email}
                          onChange={(event) => updateForm("email", event.target.value)}
                          autoComplete="email"
                          required
                          readOnly={Boolean(sessionUser)}
                        />
                      </label>

                      {!sessionUser ? (
                        <label className="form-control" htmlFor="free-agent-password">
                          <span>
                            Password <span className="register-required">*</span>
                          </span>
                          <input
                            id="free-agent-password"
                            type="password"
                            value={form.password}
                            onChange={(event) => updateForm("password", event.target.value)}
                            autoComplete="new-password"
                            required
                          />
                        </label>
                      ) : null}

                      <label className="form-control" htmlFor="free-agent-age">
                        <span>
                          Age <span className="register-required">*</span>
                        </span>
                        <input
                          id="free-agent-age"
                          value={form.age}
                          onChange={(event) => updateForm("age", event.target.value)}
                          required
                        />
                      </label>
                    </div>
                  </div>

                  <div className="sunday-league-panel-box">
                    <h3>Player Information</h3>
                    <div className="sunday-league-form-grid">
                      <label className="form-control sunday-league-form-grid__full" htmlFor="free-agent-preferred-positions">
                        <span>
                          Preferred Position(s) <span className="register-required">*</span>
                        </span>
                        <input
                          id="free-agent-preferred-positions"
                          value={form.preferred_positions}
                          onChange={(event) => updateForm("preferred_positions", event.target.value)}
                          placeholder="Wing, Striker, Center Back"
                        />
                      </label>

                      <div className="form-control sunday-league-form-grid__full">
                        <span>
                          GK / Defender / Midfielder / Attacker <span className="register-required">*</span>
                        </span>
                        <div className="sunday-league-checkbox-list">
                          {SUNDAY_LEAGUE_POSITION_GROUP_OPTIONS.map((option) => (
                            <label key={option} className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={form.position_groups.includes(option)}
                                onChange={() => togglePositionGroup(option)}
                              />
                              <span>{option}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <label className="form-control" htmlFor="free-agent-secondary-position">
                        <span>Secondary Position</span>
                        <input
                          id="free-agent-secondary-position"
                          value={form.secondary_position}
                          onChange={(event) => updateForm("secondary_position", event.target.value)}
                        />
                      </label>

                      <label className="form-control" htmlFor="free-agent-height">
                        <span>Height (Inches)</span>
                        <input
                          id="free-agent-height"
                          value={form.height_cm}
                          onChange={(event) => updateForm("height_cm", event.target.value)}
                          placeholder={`inches`}
                        />
                      </label>

                      <label className="form-control" htmlFor="free-agent-weight">
                        <span>Weight</span>
                        <input
                          id="free-agent-weight"
                          value={form.weight_lbs}
                          onChange={(event) => updateForm("weight_lbs", event.target.value)}
                          placeholder="lbs"
                        />
                      </label>

                      <FreeAgentSelectField
                        id="free-agent-dominant-foot"
                        label="Dominant Foot"
                        value={form.dominant_foot}
                        options={SUNDAY_LEAGUE_DOMINANT_FOOT_OPTIONS}
                        onChange={(value) => updateForm("dominant_foot", value as FreeAgentFormState["dominant_foot"])}
                      />
                    </div>
                  </div>

                  <div className="sunday-league-panel-box">
                    <h3>Skill Level</h3>
                    <div className="sunday-league-form-grid">
                      <FreeAgentSelectField
                        id="free-agent-skill-level"
                        label={
                          <>
                            Skill Level (Self-Rating) <span className="register-required">*</span>
                          </>
                        }
                        value={form.skill_level_label}
                        options={SUNDAY_LEAGUE_SKILL_LEVEL_OPTIONS}
                        onChange={(value) => updateForm("skill_level_label", value as FreeAgentFormState["skill_level_label"])}
                      />

                      <FreeAgentSelectField
                        id="free-agent-experience-level"
                        label={
                          <>
                            Experience Level <span className="register-required">*</span>
                          </>
                        }
                        value={form.experience_level}
                        options={SUNDAY_LEAGUE_EXPERIENCE_LEVEL_OPTIONS}
                        onChange={(value) => updateForm("experience_level", value as FreeAgentFormState["experience_level"])}
                      />
                    </div>
                  </div>

                  <div className="sunday-league-panel-box">
                    <h3>Play Style & Attributes</h3>
                    <div className="sunday-league-form-grid">
                      <label className="form-control sunday-league-form-grid__full" htmlFor="free-agent-strengths">
                        <span>Strengths</span>
                        <input
                          id="free-agent-strengths"
                          value={form.strengths}
                          onChange={(event) => updateForm("strengths", event.target.value)}
                        />
                      </label>

                      <label className="form-control sunday-league-form-grid__full" htmlFor="free-agent-weaknesses">
                        <span>Weaknesses</span>
                        <input
                          id="free-agent-weaknesses"
                          value={form.weaknesses}
                          onChange={(event) => updateForm("weaknesses", event.target.value)}
                        />
                      </label>

                      <label className="form-control sunday-league-form-grid__full" htmlFor="free-agent-play-style">
                        <span>Play Style</span>
                        <input
                          id="free-agent-play-style"
                          value={form.play_style}
                          onChange={(event) => updateForm("play_style", event.target.value)}
                          placeholder="Defensive, playmaker, aggressive, etc."
                        />
                      </label>
                    </div>
                  </div>

                  <div className="sunday-league-panel-box">
                    <h3>Availability</h3>
                    <div className="sunday-league-form-grid">
                      <FreeAgentSelectField
                        id="free-agent-availability"
                        label={
                          <>
                            Are You Available Most Sundays? <span className="register-required">*</span>
                          </>
                        }
                        value={form.sunday_availability}
                        options={SUNDAY_LEAGUE_AVAILABILITY_OPTIONS}
                        onChange={(value) => updateForm("sunday_availability", value as FreeAgentFormState["sunday_availability"])}
                      />

                      <label className="form-control sunday-league-form-grid__full" htmlFor="free-agent-conflicts">
                        <span>Any Known Conflicts?</span>
                        <textarea
                          id="free-agent-conflicts"
                          value={form.known_conflicts}
                          onChange={(event) => updateForm("known_conflicts", event.target.value)}
                          rows={4}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="sunday-league-panel-box sunday-league-panel-box--compact">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.communications_opt_in}
                        onChange={(event) => updateForm("communications_opt_in", event.target.checked)}
                      />
                      <span>{ALDRICH_COMMUNICATIONS_LABEL}</span>
                    </label>
                  </div>

                  <div className="sunday-league-form-actions">
                    {status.message ? (
                      <p className={`form-help ${status.type === "error" ? "error" : status.type === "success" ? "success" : ""}`}>{status.message}</p>
                    ) : null}
                    <button className="button primary" type="submit" disabled={status.type === "loading"}>
                      {submitLabel}
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          </article>
        </div>
      </section>
    </PageShell>
  );
}
