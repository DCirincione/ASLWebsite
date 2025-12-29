"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { AccessibilityControls } from "@/components/accessibility-controls";
import { supabase } from "@/lib/supabase/client";
import type { Profile, TeamMembership } from "@/lib/supabase/types";

type ProfileWithAvatar = Profile & { avatar_url?: string | null };
type FriendRequest = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: "pending" | "accepted" | "declined";
};
type FriendSummary = { id: string; name: string; avatar_url?: string | null };

const fallbackProfile: ProfileWithAvatar = {
  id: "demo",
  name: "Player",
  age: null,
  positions: null,
  skill_level: null,
  sports: null,
  about: "Community player focused on team play and sportsmanship.",
  avatar_url: null,
  height_cm: null,
  weight_lbs: null,
};

export default function PublicProfilePage() {
  const params = useParams<{ id: string }>();
  const profileId = params?.id;

  const [profile, setProfile] = useState<ProfileWithAvatar | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [teams, setTeams] = useState<TeamMembership[]>([]);
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingFriends, setLoadingFriends] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!profileId) {
        setStatus("error");
        return;
      }
      if (!supabase) {
        setProfile(fallbackProfile);
        setStatus("ready");
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("id,name,about,age,positions,skill_level,sports,avatar_url")
        .eq("id", profileId)
        .maybeSingle();

      if (error || !data) {
        setStatus("error");
        return;
      }

      setProfile(data as ProfileWithAvatar);
      setStatus("ready");
    };
    load();
  }, [profileId]);

  useEffect(() => {
    if (!profileId || !supabase) return;
    const loadTeams = async () => {
      setLoadingTeams(true);
      const { data, error } = await supabase
        .from("team_memberships")
        .select("*")
        .eq("user_id", profileId)
        .order("created_at", { ascending: false });
      if (!error && data) {
        setTeams(data as TeamMembership[]);
      }
      setLoadingTeams(false);
    };
    loadTeams();
  }, [profileId]);

  useEffect(() => {
    if (!profileId || !supabase) return;
    const loadFriends = async () => {
      setLoadingFriends(true);
      const { data: reqs, error } = await supabase
        .from("friend_requests")
        .select("*")
        .or(`sender_id.eq.${profileId},receiver_id.eq.${profileId}`)
        .eq("status", "accepted");
      if (error || !reqs) {
        setLoadingFriends(false);
        return;
      }
      const peerIds = Array.from(
        new Set(
          (reqs as FriendRequest[]).map((r) => (r.sender_id === profileId ? r.receiver_id : r.sender_id))
        )
      );
      if (peerIds.length === 0) {
        setFriends([]);
        setLoadingFriends(false);
        return;
      }
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,name,avatar_url")
        .in("id", peerIds);
      if (profs) {
        setFriends(
          (profs as ProfileWithAvatar[]).map((p) => ({
            id: p.id,
            name: p.name,
            avatar_url: p.avatar_url ?? null,
          }))
        );
      }
      setLoadingFriends(false);
    };
    loadFriends();
  }, [profileId]);

  const data = profile ?? fallbackProfile;
  const avatarSrc = data.avatar_url ?? "/avatar-placeholder.svg";
  const friendsCount = useMemo(() => friends.length, [friends]);

  return (
    <div className="account-page">
      <AccessibilityControls />
      <div className="account-body shell">
        <header className="account-header">
          <div className="account-header__info">
            <div className="account-avatar" aria-hidden>
              <Image src={avatarSrc} alt="" fill sizes="96px" />
            </div>
            <div className="account-header__text">
              <p className="eyebrow">Profile</p>
              <h1>{data.name}</h1>
              <p className="muted">
                {data.about ?? "This player has not added a bio yet."}
              </p>
            </div>
          </div>
          <Link className="button ghost" href="/account">
            ← Back
          </Link>
        </header>

        {status === "error" ? (
          <section className="account-card">
            <p className="muted">Unable to load this profile.</p>
          </section>
        ) : (
          <section className="account-card">
            <div className="profile-grid">
              <div className="stat">
                <p className="stat__label">Age</p>
                <p className="stat__value">{data.age ?? "—"}</p>
              </div>
              <div className="stat">
                <p className="stat__label">Skill (1-10)</p>
                <p className="stat__value">{data.skill_level ?? "—"}</p>
              </div>
              <div className="stat">
                <p className="stat__label">Positions</p>
                <p className="stat__value">{data.positions?.join(", ") ?? "—"}</p>
              </div>
              <div className="stat">
                <p className="stat__label">Sports</p>
                <p className="stat__value">{data.sports?.join(", ") ?? "—"}</p>
              </div>
              <div className="stat">
                <p className="stat__label">Friends</p>
                <p className="stat__value">{friendsCount}</p>
              </div>
            </div>
          </section>
        )}

        <section className="account-card">
          <div className="account-card__header">
            <div>
              <h3>Teams</h3>
              <p className="muted">Teams this player belongs to.</p>
            </div>
          </div>
          {loadingTeams ? (
            <p className="muted">Loading teams...</p>
          ) : teams.length === 0 ? (
            <p className="muted">No teams listed.</p>
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
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="account-card">
          <div className="account-card__header">
            <div>
              <h3>Friends</h3>
              <p className="muted">Players connected to this profile.</p>
            </div>
          </div>
          {loadingFriends ? (
            <p className="muted">Loading friends...</p>
          ) : friends.length === 0 ? (
            <p className="muted">No friends yet.</p>
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
      </div>
    </div>
  );
}
