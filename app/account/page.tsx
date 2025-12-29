"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AccessibilityControls } from "@/components/accessibility-controls";
import { supabase } from "@/lib/supabase/client";
import type { Friend, Profile, TeamMembership } from "@/lib/supabase/types";

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

export default function AccountPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "no-session">("loading");
  const [signingOut, setSigningOut] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Teams
  const [teams, setTeams] = useState<TeamMembership[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);

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

  // Search with debounce
  useEffect(() => {
    if (!search) {
      setSearchResults([]);
      return;
    }
    const handle = setTimeout(() => {
      void doSearch(search.trim());
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  const doSearch = async (term: string) => {
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
  };

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
              <p className="muted">Manage your profile, teams, and friends.</p>
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
                  <Link className="button ghost" href="/leagues">
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
                  onChange={(e) => setSearch(e.target.value)}
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

          <section className="account-card" style={{ marginTop: 12 }}>
            <h3>Your friends</h3>
            {friends.length === 0 ? (
              <p className="muted">No friends yet. Connect with players in your leagues.</p>
            ) : (
              <ul className="list list--grid">
                {friends.map((friend) => (
                  <li key={friend.id} className="team-card">
                    <div className="team-card__logo">
                      <img src={(friend as any).avatar_url ?? "/avatar-placeholder.svg"} alt="" />
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
