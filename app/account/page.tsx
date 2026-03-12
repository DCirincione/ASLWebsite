"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { AccessibilityControls } from "@/components/accessibility-controls";
import { supabase } from "@/lib/supabase/client";
import type { Event, Friend, Profile, TeamMembership } from "@/lib/supabase/types";

type ProfileData = Profile & {
  team_memberships: TeamMembership[];
  friends: Friend[];
};

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
  age: 24,
  avatar_url: null,
  positions: ["Forward", "Wing"],
  skill_level: 8,
  sports: ["Basketball", "Flag Football"],
  about:
    "Community player focused on team play and sportsmanship. Loves weekend tournaments and pickup games.",
  height_cm: null,
  weight_lbs: null,
  team_memberships: [],
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
  program_id: string;
};

type ProgramRow = {
  id: string;
  slug: string | null;
};

export default function AccountPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "no-session">("loading");
  const [signingOut, setSigningOut] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Teams
  const [teams, setTeams] = useState<TeamMembership[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [registeredEvents, setRegisteredEvents] = useState<Event[] | null>(null);
  const [eventsStatus, setEventsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [eventsError, setEventsError] = useState<string | null>(null);

  // Friends
  const [friends, setFriends] = useState<FriendWithAvatar[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileSummary>>({});
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    if (!supabase) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    setProfile(null);
    setUserId(null);
    setStatus("no-session");
    setFriends([]);
    setRequests([]);
    setProfiles({});
    setTeams([]);
    setSearch("");
    setSearchResults([]);
    setSigningOut(false);
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
        .select("id,name,about,age,positions,skill_level,sports,avatar_url")
        .eq("id", uid)
        .maybeSingle();

      if (error || !data) {
        setProfile(fallbackProfile);
        setStatus("ready");
        return;
      }

      setProfile({
        ...(data as Profile),
        team_memberships: [],
        friends: [],
      });
      setStatus("ready");
    };

    loadProfile();
  }, []);

  // Load teams
  useEffect(() => {
    const client = supabase;
    if (!client || !userId) return;
    const loadTeams = async () => {
      setLoadingTeams(true);
      const { data, error } = await client
        .from("team_memberships")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (!error && data) {
        setTeams(data as TeamMembership[]);
      }
      setLoadingTeams(false);
    };
    loadTeams();
  }, [userId]);

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
        .from("registration_submissions")
        .select("program_id")
        .eq("user_id", userId);

      if (submissionsError) {
        setRegisteredEvents(fallbackEvents);
        setEventsStatus("ready");
        setEventsError("Could not load your saved events yet.");
        return;
      }

      const programIds = Array.from(
        new Set((submissions as SubmissionRow[]).map((row) => row.program_id).filter(Boolean))
      );

      if (programIds.length === 0) {
        setRegisteredEvents([]);
        setEventsStatus("ready");
        return;
      }

      const { data: programs, error: programsError } = await supabase
        .from("registration_programs")
        .select("id,slug")
        .in("id", programIds);

      if (programsError) {
        setRegisteredEvents(fallbackEvents);
        setEventsStatus("ready");
        setEventsError("Could not load your saved events yet.");
        return;
      }

      const registrationSlugs = Array.from(
        new Set((programs as ProgramRow[]).map((row) => row.slug?.trim()).filter(Boolean))
      ) as string[];

      if (registrationSlugs.length === 0) {
        setRegisteredEvents([]);
        setEventsStatus("ready");
        return;
      }

      const { data: eventData, error: eventError } = await supabase
        .from("events")
        .select("id,title,start_date,end_date,time_info,location,description,host_type,registration_program_slug")
        .in("registration_program_slug", registrationSlugs);

      if (eventError) {
        setRegisteredEvents(fallbackEvents);
        setEventsStatus("ready");
        setEventsError("Could not load event details. Showing sample schedule.");
        return;
      }

      setRegisteredEvents((eventData ?? []) as Event[]);
      setEventsStatus("ready");
    };

    loadEvents();
  }, [userId]);

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
        setRequests(reqs as FriendRequest[]);

        const peerIds = Array.from(
          new Set(
            reqs
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
            const accepted = reqs
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
      inserted ?? { id: crypto.randomUUID(), sender_id: userId, receiver_id: receiverId, status: "pending" },
      ...prev,
    ]);

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
        <Link className="button ghost" href="/">
          ← Back
        </Link>

        <header className="account-header">
          <div className="account-header__info">
            <div className="account-avatar" aria-hidden>
              <Image src={avatarSrc} alt="" fill sizes="96px" />
            </div>
            <div className="account-header__text">
              <p className="eyebrow">Account</p>
              <h1>{data.name}</h1>
              <p className="muted">Manage your profile, events, teams, and friends.</p>
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
                  {uploadingAvatar ? "Uploading..." : "Change photo"}
                </button>
                <p className="muted">JPG or PNG, max 5MB.</p>
                {avatarError ? <p className="form-help error">{avatarError}</p> : null}
                {avatarSuccess ? <p className="form-help success">{avatarSuccess}</p> : null}
              </div>
            </div>
          </div>
          <button className="button ghost" type="button" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </header>

        <section className="account-card" id="profile">
          <h2>Profile</h2>
          <p className="muted">{data.about}</p>
          <div className="profile-grid">
            <Stat label="Age" value={data.age} />
            <Stat label="Skill (1-10)" value={data.skill_level} />
            <Stat label="Positions" value={data.positions?.join(", ") ?? "—"} />
            <Stat label="Sports" value={data.sports?.join(", ") ?? "—"} />
          </div>
        </section>

        <section className="account-card" id="events">
          <div className="account-card__header">
            <div>
              <h2>My Events</h2>
              <p className="muted">Events you have signed up for.</p>
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
              No events yet. <Link href="/events">Browse upcoming events</Link> to join.
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
                      {dateToShow ? <p className="muted">Date: {dateToShow}</p> : null}
                      {event.location ? <p className="muted">Location: {event.location}</p> : null}
                    </div>
                    {event.description ? <p className="muted">{event.description}</p> : null}
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
        </section>

        <section className="account-card">
          <div className="account-card__header">
            <div>
              <h2>My Team</h2>
              <p className="muted">Manage your teams and roster.</p>
            </div>
            <Link className="button primary" href="/register">
              Create / Join
            </Link>
          </div>
          {loadingTeams ? (
            <p className="muted">Loading your teams...</p>
          ) : teams.length === 0 ? (
            <p className="muted">No teams yet. Register or join a team to get started.</p>
          ) : (
            <ul className="list list--grid">
              {teams.map((team) => (
                <li key={team.id} className="team-card">
                  <div className="team-card__logo">
                    <img src={team.logo_url ?? "/team-placeholder.svg"} alt="" />
                  </div>
                  <div className="team-card__info">
                    <p className="list__title">{team.team_name}</p>
                    <p className="muted">{team.role ?? "Player"}</p>
                  </div>
                  <Link className="button ghost" href="/sports">
                    View Schedule
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="account-card">
          <h2>Friends</h2>

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
        </section>
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
