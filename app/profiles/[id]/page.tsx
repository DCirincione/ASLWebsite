"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { AccessibilityControls } from "@/components/accessibility-controls";
import { HistoryBackButton } from "@/components/history-back-button";
import { TeamLogoImage } from "@/components/team-logo-image";
import { calculateAgeFromDateString } from "@/lib/profile-age";
import { supabase } from "@/lib/supabase/client";
import type { Event, Profile, SundayLeagueTeam } from "@/lib/supabase/types";

type ProfileWithAvatar = Profile & { avatar_url?: string | null };
type FriendRequest = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: "pending" | "accepted" | "declined";
};
type FriendSummary = { id: string; name: string; avatar_url?: string | null };
type PublicSundayLeagueTeam = Pick<SundayLeagueTeam, "id" | "team_name" | "team_logo_url">;
type PublicRegisteredEvent = Pick<
  Event,
  "id" | "title" | "start_date" | "end_date" | "time_info" | "location" | "description"
>;

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
    return `${startStr} - ${endStr}`;
  }
  if (startDate) return startDate.toLocaleDateString(undefined, opts);
  return "";
};

export default function PublicProfilePage() {
  const params = useParams<{ id: string }>();
  const profileId = params?.id;

  const [profile, setProfile] = useState<ProfileWithAvatar | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [teams, setTeams] = useState<PublicSundayLeagueTeam[]>([]);
  const [registeredEvents, setRegisteredEvents] = useState<PublicRegisteredEvent[]>([]);
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
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
    const client = supabase;
    if (!profileId || !client) return;
    const loadTeams = async () => {
      setLoadingTeams(true);
      const { data, error } = await client
        .from("sunday_league_teams")
        .select("id,team_name,team_logo_url")
        .eq("user_id", profileId)
        .order("created_at", { ascending: false });
      if (!error && data) {
        setTeams(data as PublicSundayLeagueTeam[]);
      }
      setLoadingTeams(false);
    };
    loadTeams();
  }, [profileId]);

  useEffect(() => {
    const client = supabase;
    if (!profileId || !client) return;
    const loadEvents = async () => {
      setLoadingEvents(true);
      const { data: submissions, error: submissionsError } = await client
        .from("event_submissions")
        .select("id,event_id,created_at")
        .eq("user_id", profileId)
        .order("created_at", { ascending: false });

      if (submissionsError || !submissions) {
        setLoadingEvents(false);
        return;
      }

      const uniqueEventIds = Array.from(new Set(submissions.map((submission) => submission.event_id)));
      if (uniqueEventIds.length === 0) {
        setRegisteredEvents([]);
        setLoadingEvents(false);
        return;
      }

      const { data: events, error: eventsError } = await client
        .from("events")
        .select("id,title,start_date,end_date,time_info,location,description")
        .in("id", uniqueEventIds);

      if (eventsError || !events) {
        setRegisteredEvents([]);
        setLoadingEvents(false);
        return;
      }

      const eventsById = new Map(
        (events as PublicRegisteredEvent[]).map((event) => [event.id, event])
      );
      const orderedEvents: PublicRegisteredEvent[] = [];
      const seenEventIds = new Set<string>();

      submissions.forEach((submission) => {
        if (seenEventIds.has(submission.event_id)) return;
        const event = eventsById.get(submission.event_id);
        if (!event) return;
        orderedEvents.push(event);
        seenEventIds.add(submission.event_id);
      });

      setRegisteredEvents(orderedEvents);
      setLoadingEvents(false);
    };
    loadEvents();
  }, [profileId]);

  useEffect(() => {
    const client = supabase;
    if (!profileId || !client) return;
    const loadFriends = async () => {
      setLoadingFriends(true);
      const { data: reqs, error } = await client
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
      const { data: profs } = await client
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
          <HistoryBackButton label="← Back" fallbackHref="/account" />
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
                <p className="stat__value">{calculateAgeFromDateString(data.age) ?? "—"}</p>
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

        {loadingTeams || teams.length > 0 ? (
          <section className="account-card">
            <div className="account-card__header">
              <div>
                <h3>Sunday League Team</h3>
                <p className="muted">Sunday League team for this player.</p>
              </div>
            </div>
            {loadingTeams ? (
              <p className="muted">Loading teams...</p>
            ) : (
              <ul className="list list--grid">
                {teams.map((team) => (
                  <li key={team.id} className="team-card">
                    <div className="team-card__logo">
                      <TeamLogoImage src={team.team_logo_url} alt="" fill sizes="80px" />
                    </div>
                    <div className="team-card__info">
                      <p className="list__title">{team.team_name}</p>
                    </div>
                    <Link className="button ghost" href={`/leagues/sunday-league/teams/${team.id}`}>
                      View Team
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <section className="account-card">
          <div className="account-card__header">
            <div>
              <h3>Events</h3>
              <p className="muted">Events this player is signed up for.</p>
            </div>
          </div>
          {loadingEvents ? (
            <p className="muted">Loading events...</p>
          ) : registeredEvents.length === 0 ? (
            <p className="muted">No event submissions yet.</p>
          ) : (
            <div className="event-list">
              {registeredEvents.map((event) => {
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
