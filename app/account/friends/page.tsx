"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AccessibilityControls } from "@/components/accessibility-controls";
import { AccountNav } from "@/components/account-nav";
import { supabase } from "@/lib/supabase/client";
import type { Friend } from "@/lib/supabase/types";

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

const fallbackFriends: Friend[] = [
  { id: "f1", name: "Jordan Lee", sport: "Basketball", skill_level: 9 },
  { id: "f2", name: "Sam Patel", sport: "Flag Football", skill_level: 7 },
  { id: "f3", name: "Morgan Diaz", sport: "Pickleball", skill_level: 6 },
];

export default function AccountFriendsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendWithAvatar[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileSummary>>({});
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchDebounce, setSearchDebounce] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!supabase) {
        setFriends(fallbackFriends);
        return;
      }
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user.id ?? null;
      if (!uid) {
        setLoading(false);
        return;
      }
      setUserId(uid);

      // Load friend requests involving the user.
      setLoadingRequests(true);
      const { data: reqs, error: reqError } = await supabase
        .from("friend_requests")
        .select("*")
        .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
        .order("created_at", { ascending: false });

      if (!reqError && reqs) {
        // De-duplicate by unordered pair so we keep only the newest request between two people.
        const pairLatest = new Map<string, FriendRequest>();
        for (const r of reqs as FriendRequest[]) {
          const key =
            r.sender_id < r.receiver_id
              ? `${r.sender_id}:${r.receiver_id}`
              : `${r.receiver_id}:${r.sender_id}`;
          if (!pairLatest.has(key)) {
            pairLatest.set(key, r);
          }
        }
        const deduped = Array.from(pairLatest.values());
        setRequests(deduped);

        // Fetch profiles for everyone involved.
        const peerIds = Array.from(
          new Set(
            deduped
              .map((r) => (r.sender_id === uid ? r.receiver_id : r.sender_id))
              .filter(Boolean)
          )
        );
        if (peerIds.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id,name,sports,skill_level,avatar_url")
            .in("id", peerIds);
          if (profs) {
            const map: Record<string, ProfileSummary> = {};
            for (const p of profs) {
              map[p.id] = p as ProfileSummary;
            }
            setProfiles(map);
            const acceptedMap = new Map<string, FriendWithAvatar>();
            deduped
              .filter((r) => r.status === "accepted")
              .forEach((r) => {
                const otherId = r.sender_id === uid ? r.receiver_id : r.sender_id;
                if (acceptedMap.has(otherId)) return;
                const profile = map[otherId];
                acceptedMap.set(otherId, {
                  id: otherId,
                  name: profile?.name ?? "Friend",
                  sport: profile?.sports?.[0] ?? "Sport",
                  skill_level: profile?.skill_level ?? null,
                  avatar_url: profile?.avatar_url ?? null,
                });
              });
            setFriends(Array.from(acceptedMap.values()));
          }
        }
      }
      if (reqError) {
        // Table might not exist yet or RLS blocked; show fallback quietly.
        setRequests([]);
        setFriends(fallbackFriends);
        setError(null);
      }
      setLoading(false);
      setLoadingRequests(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (!search) {
      setSearchResults([]);
      return;
    }
    if (searchDebounce) {
      clearTimeout(searchDebounce);
    }
    const handle = setTimeout(() => {
      void doSearch(search.trim());
    }, 250);
    setSearchDebounce(handle);
    return () => clearTimeout(handle);
  }, [search]);

  const pendingIncoming = useMemo(
    () => requests.filter((r) => r.status === "pending" && r.receiver_id === userId),
    [requests, userId]
  );
  const pendingOutgoing = useMemo(
    () =>
      requests.filter(
        (r) => r.status === "pending" && r.sender_id === userId && r.receiver_id !== userId
      ),
    [requests, userId]
  );

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
        ...(requests ?? []).map((r) => (r.receiver_id === userId ? r.sender_id : r.receiver_id)),
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
    const already = requests.find((r) => {
      const samePair =
        (r.sender_id === userId && r.receiver_id === receiverId) ||
        (r.sender_id === receiverId && r.receiver_id === userId);
      return samePair && r.status === "pending";
    });
    if (already) return;
    const alreadyFriend = friends.some((f) => f.id === receiverId);
    if (alreadyFriend) return;
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

    // Fetch and cache the receiver profile so labels show names.
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

  return (
    <>
      <AccessibilityControls />
      <AccountNav />
      <div className="account-body shell">
        <header className="account-header">
          <div>
            <p className="eyebrow">Account</p>
            <h1>My Friends</h1>
            <p className="muted">Connect with teammates and opponents.</p>
          </div>
          <Link className="button ghost" href="/community">
            Find Friends
          </Link>
        </header>

        <section className="account-card">
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
        </section>

        <section className="account-card">
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

        <section className="account-card">
          <h3>Your friends</h3>
          {friends.length === 0 ? (
            <p className="muted">No friends yet. Connect with players in your sports.</p>
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
      </div>
    </>
  );
}
