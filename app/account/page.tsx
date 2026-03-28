"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { AccessibilityControls } from "@/components/accessibility-controls";
import { HistoryBackButton } from "@/components/history-back-button";
import { RegistrationModal } from "@/components/registration-modal";
import { SubmissionReviewModal } from "@/components/submission-review-modal";
import { TeamLogoImage } from "@/components/team-logo-image";
import { COUNTRY_OPTIONS, getCountryNameFromCode, normalizeCountryCode } from "@/lib/countries";
import { createId } from "@/lib/create-id";
import { isWaitlistEvent } from "@/lib/event-signups";
import { calculateAgeFromDateString } from "@/lib/profile-age";
import { supabase } from "@/lib/supabase/client";
import type { Event, Friend, JsonValue, Profile, SundayLeagueTeam } from "@/lib/supabase/types";

type ProfileData = Profile & {
  friends: Friend[];
};

type AccountSundayLeagueTeam = Pick<SundayLeagueTeam, "id" | "team_name" | "team_logo_url">;

type FriendRequest = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: "pending" | "accepted" | "declined";
};

type ProfileSummary = {
  id: string;
  name: string;
  avatar_url?: string | null;
  sports?: string[] | null;
  skill_level?: number | null;
};

type FriendWithAvatar = Friend & { avatar_url?: string | null };

const fallbackProfile: ProfileData = {
  id: "demo",
  name: "Alex Johnson",
  age: "2000-01-01",
  avatar_url: null,
  positions: ["Forward", "Wing"],
  skill_level: 8,
  sports: ["Basketball", "Flag Football"],
  about:
    "Community player focused on team play and sportsmanship. Loves weekend tournaments and pickup games.",
  height_cm: null,
  weight_lbs: null,
  friends: [],
};

const fallbackEvents: Event[] = [
  {
    id: "fallback-1",
    title: "3v3 Basketball Tournament",
    start_date: "2024-03-15",
    end_date: "2024-03-15",
    time_info: "8:00 AM tip-off",
    location: "Central Sports Complex",
    description: "Fast-paced half-court games for every division.",
  },
  {
    id: "fallback-2",
    title: "Pickleball League",
    start_date: "2024-03-20",
    end_date: "2024-04-20",
    time_info: "Weeknight doubles",
    location: "Riverside Courts",
    description: "Round-robin league with playoffs and prizes.",
  },
];

type SubmissionRow = {
  id: string;
  event_id: string;
  name: string;
  email: string;
  phone?: string | null;
  answers?: Record<string, JsonValue | undefined> | null;
  attachments?: string[] | null;
  waiver_accepted?: boolean | null;
  created_at?: string | null;
};

type EventSubmissionSummary = {
  id: string;
  event_id: string;
  name: string;
  email: string;
  phone?: string | null;
  answers?: Record<string, JsonValue | undefined> | null;
  attachments?: string[] | null;
  waiver_accepted?: boolean | null;
  created_at?: string | null;
};

type RegisteredEventItem = Event & {
  submission?: EventSubmissionSummary | null;
};

type ProfileFormState = {
  name: string;
  age: string;
  skill_level: string;
  positions: string;
  sports: string;
  about: string;
  country_code: string;
};

type SaveStatus = { type: "idle" | "loading" | "success" | "error"; message?: string };
type AccountSection = "events" | "team" | "friends";

const emptyProfileForm: ProfileFormState = {
  name: "",
  age: "",
  skill_level: "",
  positions: "",
  sports: "",
  about: "",
  country_code: "",
};

const toProfileFormState = (profile: Profile | null): ProfileFormState => ({
  name: profile?.name ?? "",
  age: profile?.age ?? "",
  skill_level: profile?.skill_level?.toString() ?? "",
  positions: profile?.positions?.join(", ") ?? "",
  sports: profile?.sports?.join(", ") ?? "",
  about: profile?.about ?? "",
  country_code: normalizeCountryCode(profile?.country_code) ?? "",
});

export default function AccountPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "no-session">("loading");
  const [signingOut, setSigningOut] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState<string | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(emptyProfileForm);
  const [profileSaveStatus, setProfileSaveStatus] = useState<SaveStatus>({ type: "idle" });
  const [activeSection, setActiveSection] = useState<AccountSection>("events");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Teams
  const [teams, setTeams] = useState<AccountSundayLeagueTeam[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [registeredEvents, setRegisteredEvents] = useState<RegisteredEventItem[] | null>(null);
  const [eventsStatus, setEventsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<EventSubmissionSummary | null>(null);
  const [selectedSubmissionEventTitle, setSelectedSubmissionEventTitle] = useState<string | null>(null);
  const [editingSubmission, setEditingSubmission] = useState<EventSubmissionSummary | null>(null);
  const [editingSubmissionEventId, setEditingSubmissionEventId] = useState<string | null>(null);
  const [editingSubmissionEventTitle, setEditingSubmissionEventTitle] = useState<string | null>(null);
  const [eventsRefreshKey, setEventsRefreshKey] = useState(0);

  // Friends
  const [friends, setFriends] = useState<FriendWithAvatar[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileSummary>>({});
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileSummary[]>([]);
  const [suggestedProfiles, setSuggestedProfiles] = useState<ProfileSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    if (!supabase) return;
    setSigningOut(true);
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError && !signOutError.message.toLowerCase().includes("session missing")) {
      setError(signOutError.message);
      setSigningOut(false);
      return;
    }
    setProfile(null);
    setUserId(null);
    setStatus("no-session");
    setFriends([]);
    setRequests([]);
    setProfiles({});
    setTeams([]);
    setSearch("");
    setSearchResults([]);
    setSuggestedProfiles([]);
    setSigningOut(false);
    window.location.assign("/");
  };

  const handleAvatarSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileInput = event.target;
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!supabase) {
      setAvatarError("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    if (!userId) {
      setAvatarError("You need to be signed in to change your photo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError("Please choose an image under 5MB.");
      return;
    }

    setUploadingAvatar(true);
    setAvatarError(null);
    setAvatarSuccess(null);

    const readAsDataUrl = () =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });

    let dataUrl: string;
    try {
      dataUrl = await readAsDataUrl();
    } catch {
      setAvatarError("Unable to read image file.");
      setUploadingAvatar(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: dataUrl })
      .eq("id", userId);

    if (updateError) {
      setAvatarError(updateError.message);
      setUploadingAvatar(false);
      return;
    }

    setProfile((prev) => (prev ? { ...prev, avatar_url: dataUrl } : prev));
    setAvatarSuccess("Profile photo updated!");
    setUploadingAvatar(false);
    fileInput.value = "";
  };

  const updateProfileForm = (key: keyof ProfileFormState, value: string) => {
    setProfileForm((prev) => ({ ...prev, [key]: value }));
  };

  const parseOptionalNumber = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    return Number.isNaN(num) ? null : num;
  };

  const parseArray = (value: string) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

  const resetProfileEditor = useCallback((nextProfile?: Profile | null) => {
    setProfileForm(toProfileFormState(nextProfile ?? profile));
    setProfileSaveStatus({ type: "idle" });
    setIsEditingProfile(false);
  }, [profile]);

  const saveProfile = async () => {
    if (!supabase) {
      setProfileSaveStatus({ type: "error", message: "Supabase is not configured." });
      return;
    }
    if (!userId) {
      setProfileSaveStatus({ type: "error", message: "You need to be signed in to edit your profile." });
      return;
    }

    const payload = {
      name: profileForm.name.trim() || "Player",
      age: profileForm.age.trim() || null,
      skill_level: parseOptionalNumber(profileForm.skill_level),
      positions: parseArray(profileForm.positions),
      sports: parseArray(profileForm.sports),
      about: profileForm.about.trim() || null,
      country_code: profileForm.country_code || null,
    };

    setProfileSaveStatus({ type: "loading" });

    const { error: updateError } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", userId);

    if (updateError) {
      setProfileSaveStatus({ type: "error", message: updateError.message });
      return;
    }

    setProfile((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ...payload,
      };
    });
    setProfileForm((prev) => ({ ...prev, name: payload.name, about: payload.about ?? "" }));
    setProfileSaveStatus({ type: "success", message: "Profile updated." });
    setIsEditingProfile(false);
  };

  // Load profile and session
  useEffect(() => {
    const loadProfile = async () => {
      if (!supabase) {
        setProfile(fallbackProfile);
        setStatus("ready");
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user.id ?? null;
      if (!uid) {
        setStatus("no-session");
        return;
      }
      setUserId(uid);

      const { data, error } = await supabase
        .from("profiles")
        .select("id,name,about,age,positions,skill_level,sports,avatar_url,country_code")
        .eq("id", uid)
        .maybeSingle();

      if (error || !data) {
        setProfile(fallbackProfile);
        setStatus("ready");
        return;
      }

      setProfile({
        ...(data as Profile),
        friends: [],
      });
      setStatus("ready");
    };

    loadProfile();
  }, []);

  useEffect(() => {
    setProfileForm(toProfileFormState(profile));
  }, [profile]);

  // Load teams
  useEffect(() => {
    const client = supabase;
    if (!client || !userId) return;
    const loadTeams = async () => {
      setLoadingTeams(true);
      const { data, error } = await client
        .from("sunday_league_teams")
        .select("id,team_name,team_logo_url")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (!error && data) {
        setTeams(data as AccountSundayLeagueTeam[]);
      }
      setLoadingTeams(false);
    };
    loadTeams();
  }, [userId]);

  useEffect(() => {
    const loadSuggestedProfiles = async () => {
      if (!supabase || !userId) {
        setSuggestedProfiles([]);
        return;
      }

      setSuggestionsLoading(true);
      const { data, error: profilesError } = await supabase
        .from("profiles")
        .select("id,name,sports,skill_level,avatar_url")
        .order("name", { ascending: true })
        .limit(24);

      if (profilesError || !data) {
        setSuggestedProfiles([]);
        setSuggestionsLoading(false);
        return;
      }

      const existingIds = new Set<string>([
        ...friends.map((friend) => friend.id),
        ...requests.map((request) => (request.sender_id === userId ? request.receiver_id : request.sender_id)),
        userId,
      ]);

      const suggestions = (data as ProfileSummary[]).filter((profile) => !existingIds.has(profile.id));
      setSuggestedProfiles(suggestions);
      setProfiles((prev) => {
        const next = { ...prev };
        for (const profile of suggestions) {
          next[profile.id] = profile;
        }
        return next;
      });
      setSuggestionsLoading(false);
    };

    void loadSuggestedProfiles();
  }, [friends, requests, userId]);

  // Load registered events
  useEffect(() => {
    const loadEvents = async () => {
      setEventsError(null);
      if (!supabase || !userId) {
        setRegisteredEvents([]);
        setEventsStatus("ready");
        return;
      }

      setEventsStatus("loading");
      const { data: submissions, error: submissionsError } = await supabase
        .from("event_submissions")
        .select("id,event_id,name,email,phone,answers,attachments,waiver_accepted,created_at")
        .eq("user_id", userId);

      if (submissionsError) {
        setRegisteredEvents(fallbackEvents as RegisteredEventItem[]);
        setEventsStatus("ready");
        setEventsError("Could not load your saved events yet.");
        return;
      }

      const submissionRows = (submissions ?? []) as SubmissionRow[];
      const latestSubmissionByEvent = new Map<string, EventSubmissionSummary>();
      for (const row of submissionRows) {
        if (!row.event_id) continue;
        const existing = latestSubmissionByEvent.get(row.event_id);
        const nextCreatedAt = row.created_at ? new Date(row.created_at).getTime() : 0;
        const existingCreatedAt = existing?.created_at ? new Date(existing.created_at).getTime() : 0;
        if (!existing || nextCreatedAt >= existingCreatedAt) {
          latestSubmissionByEvent.set(row.event_id, {
            id: row.id,
            event_id: row.event_id,
            name: row.name,
            email: row.email,
            phone: row.phone ?? null,
            answers: row.answers ?? null,
            attachments: row.attachments ?? null,
            waiver_accepted: row.waiver_accepted ?? false,
            created_at: row.created_at ?? null,
          });
        }
      }

      const eventIds = Array.from(new Set(submissionRows.map((row) => row.event_id).filter(Boolean)));

      if (eventIds.length === 0) {
        setRegisteredEvents([]);
        setEventsStatus("ready");
        return;
      }

      const { data: eventData, error: eventError } = await supabase
        .from("events")
        .select("id,title,start_date,end_date,time_info,location,description,host_type,signup_mode,registration_program_slug")
        .in("id", eventIds);

      if (eventError) {
        setRegisteredEvents(fallbackEvents as RegisteredEventItem[]);
        setEventsStatus("ready");
        setEventsError("Could not load event details. Showing sample schedule.");
        return;
      }

      setRegisteredEvents(
        ((eventData ?? []) as Event[]).map((event) => ({
          ...event,
          submission: latestSubmissionByEvent.get(event.id) ?? null,
        }))
      );
      setEventsStatus("ready");
    };

    loadEvents();
  }, [userId, eventsRefreshKey]);

  // Load friend requests + accepted friends
  useEffect(() => {
    const client = supabase;
    if (!client || !userId) return;
    const loadFriendsData = async () => {
      setLoadingRequests(true);
      const { data: reqs, error: reqError } = await client
        .from("friend_requests")
        .select("*")
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order("created_at", { ascending: false });

      if (!reqError && reqs) {
        const requestRows = reqs as FriendRequest[];
        setRequests(requestRows);

        const peerIds = Array.from(
          new Set(
            requestRows
              .map((r) => (r.sender_id === userId ? r.receiver_id : r.sender_id))
              .filter(Boolean)
          )
        );
        if (peerIds.length > 0) {
          const { data: profs } = await client
            .from("profiles")
            .select("id,name,sports,skill_level,avatar_url")
            .in("id", peerIds);
          if (profs) {
            const map: Record<string, ProfileSummary> = {};
            for (const p of profs) {
              map[p.id] = p as ProfileSummary;
            }
            setProfiles(map);
            const accepted = requestRows
              .filter((r) => r.status === "accepted")
              .map((r) => {
                const otherId = r.sender_id === userId ? r.receiver_id : r.sender_id;
                const profile = map[otherId];
                return {
                  id: otherId,
                  name: profile?.name ?? "Friend",
                  sport: profile?.sports?.[0] ?? "Sport",
                  skill_level: profile?.skill_level ?? null,
                  avatar_url: profile?.avatar_url ?? null,
                } as FriendWithAvatar;
              });
            setFriends(accepted);
          }
        }
      } else {
        setRequests([]);
      }
      setLoadingRequests(false);
    };
    loadFriendsData();
  }, [userId]);

  const doSearch = useCallback(async (term: string) => {
    if (!supabase) return;
    if (!term) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const { data, error: searchError } = await supabase
      .from("profiles")
      .select("id,name,sports,skill_level,avatar_url")
      .ilike("name", `%${term}%`)
      .limit(10);
    if (!searchError && data) {
      const existingIds = new Set<string>([
        ...(friends ?? []).map((f) => f.id),
        ...(requests ?? []).map((r) => (r.sender_id === userId ? r.receiver_id : r.sender_id)),
        userId ?? "",
      ]);
      setSearchResults((data as ProfileSummary[]).filter((p) => !existingIds.has(p.id)));
    } else {
      setSearchResults([]);
    }
    setSearchLoading(false);
  }, [friends, requests, userId]);

  // Search with debounce
  useEffect(() => {
    if (!search) return;
    const handle = setTimeout(() => {
      void doSearch(search.trim());
    }, 250);
    return () => clearTimeout(handle);
  }, [search, doSearch]);

  const sendRequest = async (receiverId: string) => {
    if (!supabase || !userId) return;
    const { error: insertError, data } = await supabase
      .from("friend_requests")
      .insert({ sender_id: userId, receiver_id: receiverId, status: "pending" });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    const inserted = (data as FriendRequest[] | null)?.[0];
    setRequests((prev) => [
      inserted ?? { id: createId(), sender_id: userId, receiver_id: receiverId, status: "pending" },
      ...prev,
    ]);
    setSearchResults((prev) => prev.filter((profile) => profile.id !== receiverId));
    setSuggestedProfiles((prev) => prev.filter((profile) => profile.id !== receiverId));

    if (!profiles[receiverId]) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id,name,sports,skill_level,avatar_url")
        .eq("id", receiverId)
        .maybeSingle();
      if (prof) {
        setProfiles((prev) => ({ ...prev, [receiverId]: prof as ProfileSummary }));
      }
    }
  };

  const respondToRequest = async (id: string, status: "accepted" | "declined") => {
    if (!supabase) return;
    const { error: updateError } = await supabase.from("friend_requests").update({ status }).eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  const getProfile = (id: string) => profiles[id];
  const labelForProfile = (id: string) => {
    const profile = getProfile(id);
    return profile ? profile.name : "Player";
  };

  const pendingIncoming = useMemo(
    () => requests.filter((r) => r.status === "pending" && r.receiver_id === userId),
    [requests, userId]
  );

  const pendingOutgoing = useMemo(
    () => requests.filter((r) => r.status === "pending" && r.sender_id === userId),
    [requests, userId]
  );

  const parseDateUTC = (value?: string | null) => {
    if (!value) return null;
    const parts = value.split("-").map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
    const [year, month, day] = parts;
    return new Date(Date.UTC(year, month - 1, day));
  };

  const formatDateRange = (start?: string | null, end?: string | null) => {
    if (!start && !end) return "";
    const startDate = parseDateUTC(start);
    const endDate = parseDateUTC(end);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
    if (startDate && endDate) {
      if (startDate.getTime() === endDate.getTime()) {
        return startDate.toLocaleDateString(undefined, opts);
      }
      const sameMonth = startDate.getMonth() === endDate.getMonth();
      const sameYear = startDate.getFullYear() === endDate.getFullYear();
      const startStr = startDate.toLocaleDateString(undefined, opts);
      const endStr = endDate.toLocaleDateString(
        undefined,
        sameMonth && sameYear ? { day: "numeric", timeZone: "UTC" } : opts
      );
      return `${startStr} – ${endStr}`;
    }
    if (startDate) return startDate.toLocaleDateString(undefined, opts);
    return "";
  };

  if (status === "loading") {
    return (
      <div className="account-page">
        <AccessibilityControls />
        <div className="account-body shell">
          <p className="muted">Loading your account...</p>
        </div>
      </div>
    );
  }

  if (status === "no-session") {
    return (
      <div className="account-page">
        <AccessibilityControls />
        <div className="account-body shell">
          <p className="muted">Sign in to view your account.</p>
        </div>
      </div>
    );
  }

  const data = profile ?? fallbackProfile;
  const avatarSrc = data.avatar_url ?? "/avatar-placeholder.svg";

  return (
    <div className="account-page">
      <AccessibilityControls />
      <div className="account-body shell" style={{ gap: 12 }}>
        <HistoryBackButton label="← Back" fallbackHref="/" />

        <section className="account-card account-profile-card" id="profile">
          <header className="account-header">
            <div className="account-header__info">
              <div className="account-avatar" aria-hidden>
                <Image src={avatarSrc} alt="" fill sizes="96px" />
              </div>
              <div className="account-header__text">
                <p className="eyebrow">Account</p>
                <h1>{data.name}</h1>
                <p className="muted">Manage your profile, events, teams, and friends.</p>
              </div>
            </div>
            <div className="account-create__actions">
              {!isEditingProfile ? (
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => {
                    setProfileForm(toProfileFormState(data));
                    setProfileSaveStatus({ type: "idle" });
                    setIsEditingProfile(true);
                  }}
                >
                  Edit Profile
                </button>
              ) : null}
              <button className="button ghost" type="button" onClick={handleSignOut} disabled={signingOut}>
                {signingOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          </header>

          <div className="account-card__header">
            <div>
              <h2>Profile</h2>
            </div>
            {isEditingProfile ? (
              <button className="button ghost" type="button" onClick={() => resetProfileEditor()}>
                Cancel
              </button>
            ) : null}
          </div>

          {isEditingProfile ? (
            <form
              className="account-form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveProfile();
              }}
            >
              <div className="form-grid">
                <div className="form-control">
                  <label htmlFor="profile-name">Full Name</label>
                  <input
                    id="profile-name"
                    value={profileForm.name}
                    onChange={(event) => updateProfileForm("name", event.target.value)}
                    required
                  />
                </div>
                <div className="form-control">
                  <label htmlFor="profile-age">Birthday</label>
                  <input
                    id="profile-age"
                    type="date"
                    value={profileForm.age}
                    onChange={(event) => updateProfileForm("age", event.target.value)}
                  />
                </div>
                <div className="form-control">
                  <label htmlFor="profile-skill">Skill (1-10)</label>
                  <input
                    id="profile-skill"
                    value={profileForm.skill_level}
                    onChange={(event) => updateProfileForm("skill_level", event.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div className="form-control">
                  <label htmlFor="profile-country">Country</label>
                  <select
                    id="profile-country"
                    value={profileForm.country_code}
                    onChange={(event) => updateProfileForm("country_code", event.target.value)}
                  >
                    <option value="">Select country</option>
                    {COUNTRY_OPTIONS.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-control">
                  <label htmlFor="profile-positions">Positions</label>
                  <input
                    id="profile-positions"
                    value={profileForm.positions}
                    onChange={(event) => updateProfileForm("positions", event.target.value)}
                    placeholder="Forward, Wing"
                  />
                </div>
                <div className="form-control">
                  <label htmlFor="profile-sports">Sports</label>
                  <input
                    id="profile-sports"
                    value={profileForm.sports}
                    onChange={(event) => updateProfileForm("sports", event.target.value)}
                    placeholder="Basketball, Flag Football"
                  />
                </div>
              </div>
              <div className="form-control">
                <label>Photo</label>
                <div className="avatar-upload">
                  <input
                    ref={fileInputRef}
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarSelect}
                    className="sr-only"
                  />
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                  >
                    {uploadingAvatar ? "Uploading..." : "Edit Photo"}
                  </button>
                  <p className="muted">JPG or PNG, max 5MB.</p>
                  {avatarError ? <p className="form-help error">{avatarError}</p> : null}
                  {avatarSuccess ? <p className="form-help success">{avatarSuccess}</p> : null}
                </div>
              </div>
              <div className="form-control">
                <label htmlFor="profile-about">Bio</label>
                <textarea
                  id="profile-about"
                  value={profileForm.about}
                  onChange={(event) => updateProfileForm("about", event.target.value)}
                  rows={4}
                />
              </div>
              {profileSaveStatus.message ? (
                <p className={`form-help ${profileSaveStatus.type === "error" ? "error" : profileSaveStatus.type === "success" ? "success" : ""}`}>
                  {profileSaveStatus.message}
                </p>
              ) : null}
              <div className="account-create__actions">
                <button className="button primary" type="submit" disabled={profileSaveStatus.type === "loading"}>
                  {profileSaveStatus.type === "loading" ? "Saving..." : "Save Profile"}
                </button>
                <button className="button ghost" type="button" onClick={() => resetProfileEditor()} disabled={profileSaveStatus.type === "loading"}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <p className="muted">{data.about || "Add a bio so other players know how you play."}</p>
              <div className="profile-grid">
                <Stat label="Age" value={calculateAgeFromDateString(data.age)} />
                <Stat label="Country" value={getCountryNameFromCode(data.country_code)} />
                <Stat label="Skill (1-10)" value={data.skill_level} />
                <Stat label="Positions" value={data.positions?.join(", ") ?? "—"} />
                <Stat label="Sports" value={data.sports?.join(", ") ?? "—"} />
              </div>
            </>
          )}
        </section>

        <section className="account-card account-tabs-card">
          <div className="account-tabs" role="tablist" aria-label="Account sections">
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === "events"}
              className={`account-tabs__button${activeSection === "events" ? " is-active" : ""}`}
              onClick={() => setActiveSection("events")}
            >
              My Events
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === "friends"}
              className={`account-tabs__button${activeSection === "friends" ? " is-active" : ""}`}
              onClick={() => setActiveSection("friends")}
            >
              My Friends
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === "team"}
              className={`account-tabs__button${activeSection === "team" ? " is-active" : ""}`}
              onClick={() => setActiveSection("team")}
            >
              My Team
            </button>
          </div>

          {activeSection === "events" ? (
            <>
              <div className="account-card__header">
                <div>
                  <h2>My Events</h2>
                  <p className="muted">Events you registered for or joined the waitlist for.</p>
                </div>
              </div>
              {eventsError ? (
                <p className="muted" role="status" aria-live="polite">
                  {eventsError}
                </p>
              ) : null}
              {eventsStatus === "loading" ? (
                <p className="muted">Loading your events...</p>
              ) : (registeredEvents ?? []).length === 0 ? (
                <p className="muted">
                  No event submissions yet. <Link href="/events">Browse upcoming events</Link> to join.
                </p>
              ) : (
                <div className="event-list">
                  {(registeredEvents ?? []).map((event) => {
                    const dateRange = formatDateRange(event.start_date, event.end_date);
                    const primaryDate = event.time_info?.trim() || null;
                    const fallbackDate = primaryDate ? null : dateRange;
                    const dateToShow = primaryDate || fallbackDate || null;
                    return (
                      <article key={event.id} className="event-card-simple">
                        <div className="event-card__header">
                          <h3>{event.title}</h3>
                        </div>
                        <div className="event-card__meta">
                          <p className="muted">{isWaitlistEvent(event) ? "Status: Joined waitlist" : "Status: Registered"}</p>
                          {dateToShow ? <p className="muted">Date: {dateToShow}</p> : null}
                          {event.location ? <p className="muted">Location: {event.location}</p> : null}
                        </div>
                        {event.description ? <p className="muted">{event.description}</p> : null}
                        {event.submission ? (
                          <div style={{ marginTop: 12 }}>
                            <button
                              className="button ghost"
                              type="button"
                              onClick={() => {
                                setSelectedSubmission(event.submission ?? null);
                                setSelectedSubmissionEventTitle(event.title);
                              }}
                            >
                              View Submission
                            </button>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <Link className="button primary" href="/events">
                  Browse Events
                </Link>
              </div>
            </>
          ) : null}

          {activeSection === "team" ? (
            <>
              <div className="account-card__header">
                <div>
                  <h2>Your Sunday League Team</h2>
                  <p className="muted">Manage your Sunday League team and roster.</p>
                </div>
              </div>
              {loadingTeams ? (
                <p className="muted">Loading your teams...</p>
              ) : teams.length === 0 ? (
                <p className="muted">
                  No team yet. <Link href="/leagues/sunday-league">Go to Sunday League</Link> to create one.
                </p>
              ) : (
                <ul className="list list--grid">
                  {teams.map((team) => (
                    <li key={team.id} className="team-card">
                      <div className="team-card__logo">
                        <TeamLogoImage src={team.team_logo_url} alt="" fill sizes="80px" />
                      </div>
                      <div className="team-card__info">
                        <p className="list__title">{team.team_name}</p>
                        <p className="muted">Sunday League team</p>
                      </div>
                      <Link className="button ghost" href={`/leagues/sunday-league/team/${team.id}`}>
                        Team Portal
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}

          {activeSection === "friends" ? (
            <>
              <div className="account-card__header account-card__header--compact">
                <div>
                  <h2>Friends</h2>
                </div>
              </div>

              <div className="search-panel">
            <div className="search-panel__text">
              <p className="eyebrow">Find players</p>
              <h3>Search the community</h3>
              <p className="muted">Send a request to connect and keep up with teammates and rivals.</p>
            </div>
            <div className="search-panel__controls">
              <label className="sr-only" htmlFor="friend-search">
                Search by name
              </label>
              <div className="search-panel__input">
                <input
                  id="friend-search"
                  value={search}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSearch(value);
                    if (!value.trim()) {
                      setSearchResults([]);
                    }
                  }}
                  placeholder="Search by name"
                  autoComplete="off"
                />
                <button className="button primary" type="button" onClick={() => doSearch(search.trim())} disabled={searchLoading}>
                  Search
                </button>
                {searchResults.length > 0 ? (
                  <ul className="search-dropdown">
                    {searchResults.map((p) => (
                      <li key={p.id} className="search-dropdown__item">
                        <div className="team-card__logo">
                          <img src={p.avatar_url ?? "/avatar-placeholder.svg"} alt="" />
                        </div>
                        <div className="search-dropdown__info">
                          <p className="list__title">{p.name}</p>
                        </div>
                        <div className="search-dropdown__actions">
                          <Link className="button ghost" href={`/profiles/${p.id}`}>
                            View
                          </Link>
                          <button className="button primary" type="button" onClick={() => sendRequest(p.id)}>
                            Add
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </div>
          {search && !searchLoading && searchResults.length === 0 ? (
            <p className="muted" style={{ marginTop: 12 }}>
              No players found for “{search}”.
            </p>
          ) : null}

          <section className="account-card" style={{ marginTop: 12 }}>
            <h3>Your friends</h3>
            {friends.length === 0 ? (
            <p className="muted">No friends yet. Connect with players in your sports.</p>
            ) : (
              <ul className="list list--grid">
                {friends.map((friend) => (
                  <li key={friend.id} className="team-card">
                    <div className="team-card__logo">
                      <img src={friend.avatar_url ?? "/avatar-placeholder.svg"} alt="" />
                    </div>
                    <div className="team-card__info">
                      <p className="list__title">{friend.name}</p>
                    </div>
                    <Link className="button ghost" href={`/profiles/${friend.id}`}>
                      View Profile
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="account-card" style={{ marginTop: 12 }}>
            <div className="account-card__header">
              <div>
                <h3>People you may know</h3>
                <p className="muted">Discover other players on the site.</p>
              </div>
              <button className="button ghost" type="button" onClick={() => setShowSuggestions((prev) => !prev)}>
                {showSuggestions ? "Hide" : "Show People"}
              </button>
            </div>
            {showSuggestions ? (
              suggestionsLoading ? (
                <p className="muted">Loading people...</p>
              ) : suggestedProfiles.length === 0 ? (
                <p className="muted">No new people to suggest right now.</p>
              ) : (
                <ul className="list list--grid">
                  {suggestedProfiles.map((person) => (
                    <li key={person.id} className="team-card">
                      <div className="team-card__logo">
                        <img src={person.avatar_url ?? "/avatar-placeholder.svg"} alt="" />
                      </div>
                      <div className="team-card__info">
                        <p className="list__title">{person.name}</p>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <Link className="button ghost" href={`/profiles/${person.id}`}>
                          View
                        </Link>
                        <button className="button primary" type="button" onClick={() => sendRequest(person.id)}>
                          Add
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </section>
          <section className="account-card" style={{ marginTop: 12 }}>
            <h3>Friend requests</h3>
            {pendingIncoming.length === 0 && pendingOutgoing.length === 0 ? (
              <p className="muted">No pending requests.</p>
            ) : (
              <>
                {pendingIncoming.length > 0 ? (
                  <>
                    <p className="list__title">Incoming</p>
                    <ul className="list" style={{ display: "grid", gap: 8 }}>
                      {pendingIncoming.map((req) => (
                        <li key={req.id} className="team-card">
                          <div className="team-card__logo">
                            <img
                              src={getProfile(req.sender_id)?.avatar_url ?? "/avatar-placeholder.svg"}
                              alt=""
                            />
                          </div>
                          <div className="team-card__info">
                            <p className="list__title">{labelForProfile(req.sender_id)}</p>
                            <p className="muted">Wants to connect</p>
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <Link className="button ghost" href={`/profiles/${req.sender_id}`}>
                              View
                            </Link>
                            <button
                              className="button primary"
                              type="button"
                              onClick={() => respondToRequest(req.id, "accepted")}
                              disabled={loadingRequests}
                            >
                              Accept
                            </button>
                            <button
                              className="button ghost"
                              type="button"
                              onClick={() => respondToRequest(req.id, "declined")}
                              disabled={loadingRequests}
                            >
                              Decline
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {pendingOutgoing.length > 0 ? (
                  <>
                    <p className="list__title" style={{ marginTop: 12 }}>
                      Sent
                    </p>
                    <ul className="list" style={{ display: "grid", gap: 8 }}>
                      {pendingOutgoing.map((req) => (
                        <li key={req.id} className="team-card">
                          <div className="team-card__logo">
                            <img
                              src={getProfile(req.receiver_id)?.avatar_url ?? "/avatar-placeholder.svg"}
                              alt=""
                            />
                          </div>
                          <div className="team-card__info">
                            <p className="list__title">{labelForProfile(req.receiver_id)}</p>
                            <p className="muted">Request sent</p>
                          </div>
                          <Link className="button ghost" href={`/profiles/${req.receiver_id}`}>
                            View
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </>
            )}
          </section>
          {error ? <p className="form-help error">{error}</p> : null}
            </>
          ) : null}
        </section>

        <SubmissionReviewModal
          open={Boolean(selectedSubmission && selectedSubmissionEventTitle)}
          submission={
            selectedSubmission && selectedSubmissionEventTitle
              ? {
                  eventTitle: selectedSubmissionEventTitle,
                  submittedAt: selectedSubmission.created_at,
                  name: selectedSubmission.name,
                  email: selectedSubmission.email,
                  phone: selectedSubmission.phone,
                  answers: selectedSubmission.answers,
                  attachments: selectedSubmission.attachments,
                  waiverAccepted: selectedSubmission.waiver_accepted,
                }
              : null
          }
          onEdit={
            selectedSubmission && selectedSubmissionEventTitle
              ? () => {
                  setEditingSubmission(selectedSubmission);
                  setEditingSubmissionEventId(selectedSubmission.event_id);
                  setEditingSubmissionEventTitle(selectedSubmissionEventTitle);
                  setSelectedSubmission(null);
                  setSelectedSubmissionEventTitle(null);
                }
              : undefined
          }
          onClose={() => {
            setSelectedSubmission(null);
            setSelectedSubmissionEventTitle(null);
          }}
        />
        <RegistrationModal
          open={Boolean(editingSubmission && editingSubmissionEventId)}
          eventId={editingSubmissionEventId}
          contextTitle={editingSubmissionEventTitle ?? undefined}
          mode="edit"
          submissionId={editingSubmission?.id ?? null}
          initialSubmission={editingSubmission}
          onClose={() => {
            setEditingSubmission(null);
            setEditingSubmissionEventId(null);
            setEditingSubmissionEventTitle(null);
          }}
          onSubmitted={() => {
            setEditingSubmission(null);
            setEditingSubmissionEventId(null);
            setEditingSubmissionEventTitle(null);
            setSelectedSubmission(null);
            setSelectedSubmissionEventTitle(null);
            setEventsRefreshKey((prev) => prev + 1);
          }}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="stat">
      <p className="stat__label">{label}</p>
      <p className="stat__value">{value ?? "—"}</p>
    </div>
  );
}
