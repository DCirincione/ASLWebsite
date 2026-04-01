"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AccessibilityControls } from "@/components/accessibility-controls";
import { HistoryBackButton } from "@/components/history-back-button";
import { TeamLogoImage } from "@/components/team-logo-image";
import { isMissingDirectMessagesTableError } from "@/lib/direct-messages";
import { isMissingInboxTableError } from "@/lib/inbox";
import { supabase } from "@/lib/supabase/client";
import type { Profile, SundayLeagueTeam, SundayLeagueTeamMember, UserDirectMessage, UserInboxMessage } from "@/lib/supabase/types";

type AccountSundayLeagueTeam = Pick<SundayLeagueTeam, "id" | "team_name" | "team_logo_url">;
type TeamInvite = SundayLeagueTeamMember & { team: AccountSundayLeagueTeam | null };
type InboxStatus = "loading" | "ready" | "error" | "no-session";
type MessageCenterTab = "inbox" | "chats";
type ChatProfile = Pick<Profile, "id" | "name" | "avatar_url" | "sports">;
type InboxEntry =
  | {
      type: "announcement";
      id: string;
      title: string;
      message: string;
      created_at?: string | null;
      is_read: boolean;
      sender_name?: string | null;
    }
  | {
      type: "invite";
      id: string;
      title: string;
      message: string;
      created_at?: string | null;
      team: AccountSundayLeagueTeam | null;
    };
type ConversationSummary = {
  partnerId: string;
  lastMessage: UserDirectMessage;
  unreadCount: number;
};

type DirectMessagesApiPayload = {
  messages?: UserDirectMessage[];
  message?: UserDirectMessage;
  updatedIds?: string[];
  readAt?: string;
  error?: string;
};

const formatInboxDate = (value?: string | null) => {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const getDateValue = (value?: string | null) => {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const upsertDirectMessage = (messages: UserDirectMessage[], nextMessage: UserDirectMessage) =>
  [...messages.filter((message) => message.id !== nextMessage.id), nextMessage].sort(
    (left, right) => getDateValue(left.created_at) - getDateValue(right.created_at),
  );

const isChatsTabValue = (value?: string | null): value is MessageCenterTab => value === "inbox" || value === "chats";

const getAuthorizedApiHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
});

const readDirectMessagesApiPayload = async (response: Response) => {
  const payload = (await response.json().catch(() => null)) as DirectMessagesApiPayload | null;
  return payload ?? {};
};

const fetchDirectMessagesFromApi = async (accessToken: string) => {
  const response = await fetch("/api/direct-messages", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  const payload = await readDirectMessagesApiPayload(response);

  return {
    ok: response.ok,
    error: response.ok ? null : payload.error ?? "Could not load your chats.",
    messages: payload.messages ?? [],
  };
};

const sendDirectMessageThroughApi = async (accessToken: string, recipientUserId: string, message: string) => {
  const response = await fetch("/api/direct-messages", {
    method: "POST",
    headers: getAuthorizedApiHeaders(accessToken),
    body: JSON.stringify({ recipientUserId, message }),
  });
  const payload = await readDirectMessagesApiPayload(response);

  return {
    ok: response.ok,
    error: response.ok ? null : payload.error ?? "Could not send the message.",
    message: payload.message ?? null,
  };
};

const markDirectMessagesReadThroughApi = async (accessToken: string, messageIds: string[], readAt: string) => {
  const response = await fetch("/api/direct-messages", {
    method: "PATCH",
    headers: getAuthorizedApiHeaders(accessToken),
    body: JSON.stringify({ messageIds, readAt }),
  });
  const payload = await readDirectMessagesApiPayload(response);

  return {
    ok: response.ok,
    error: response.ok ? null : payload.error ?? "Could not mark chat messages as read.",
    updatedIds: payload.updatedIds ?? [],
    readAt: payload.readAt ?? readAt,
  };
};

function AccountInboxContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<UserInboxMessage[]>([]);
  const [pendingInvites, setPendingInvites] = useState<TeamInvite[]>([]);
  const [directMessages, setDirectMessages] = useState<UserDirectMessage[]>([]);
  const [chatProfiles, setChatProfiles] = useState<Record<string, ChatProfile>>({});
  const [status, setStatus] = useState<InboxStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [markingMessageId, setMarkingMessageId] = useState<string | null>(null);
  const [markingConversationId, setMarkingConversationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MessageCenterTab>("inbox");
  const [selectedChatUserId, setSelectedChatUserId] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState<ChatProfile[]>([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);

  const syncRouteState = useCallback(
    (tab: MessageCenterTab, chatUserId?: string | null) => {
      const params = new URLSearchParams(searchParams.toString());

      if (tab === "chats") {
        params.set("tab", "chats");
      } else {
        params.delete("tab");
      }

      if (chatUserId) {
        params.set("chat", chatUserId);
      } else {
        params.delete("chat");
      }

      const query = params.toString();
      router.replace(query ? `/account/inbox?${query}` : "/account/inbox", { scroll: false });
    },
    [router, searchParams],
  );

  const openInboxTab = useCallback(() => {
    setActiveTab("inbox");
    setSelectedChatUserId(null);
    syncRouteState("inbox", null);
  }, [syncRouteState]);

  const openChat = useCallback(
    (userId: string) => {
      setActiveTab("chats");
      setSelectedChatUserId(userId);
      syncRouteState("chats", userId);
    },
    [syncRouteState],
  );

  const loadDirectMessagesState = useCallback(
    async (accessToken: string, userId: string, requestedChatUserId?: string | null) => {
      const client = supabase;
      if (!client) {
        return {
          nextDirectMessages: [] as UserDirectMessage[],
          nextChatProfiles: {} as Record<string, ChatProfile>,
          nextChatError: "Supabase is not configured.",
        };
      }

      const directMessagesResponse = await fetchDirectMessagesFromApi(accessToken);
      const nextDirectMessages = directMessagesResponse.ok ? directMessagesResponse.messages : [];
      let nextChatError: string | null = directMessagesResponse.ok
        ? null
        : isMissingDirectMessagesTableError(directMessagesResponse.error)
          ? "Direct messages are not set up yet. Run the direct messages setup in Supabase first."
          : directMessagesResponse.error ?? "Could not load your chats.";

      const partnerIds = Array.from(
        new Set(
          nextDirectMessages.flatMap((message) =>
            message.sender_user_id === userId ? [message.recipient_user_id] : [message.sender_user_id],
          ),
        ),
      );

      if (requestedChatUserId && requestedChatUserId !== userId) {
        partnerIds.push(requestedChatUserId);
      }

      const uniquePartnerIds = Array.from(new Set(partnerIds.filter(Boolean)));
      let nextChatProfiles: Record<string, ChatProfile> = {};

      if (uniquePartnerIds.length > 0) {
        const { data: partnerProfiles, error: partnerProfilesError } = await client
          .from("profiles")
          .select("id,name,avatar_url,sports")
          .in("id", uniquePartnerIds);

        if (partnerProfilesError) {
          nextChatError = partnerProfilesError.message ?? nextChatError ?? "Could not load chat members.";
        } else {
          nextChatProfiles = (partnerProfiles ?? []).reduce<Record<string, ChatProfile>>((acc, profile) => {
            const nextProfile = profile as ChatProfile;
            acc[nextProfile.id] = nextProfile;
            return acc;
          }, {});
        }
      }

      return { nextDirectMessages, nextChatProfiles, nextChatError };
    },
    [],
  );

  const loadMessageCenter = useCallback(async () => {
    if (!supabase) {
      setAnnouncements([]);
      setPendingInvites([]);
      setDirectMessages([]);
      setChatProfiles({});
      setStatus("error");
      setError("Supabase is not configured.");
      setChatError("Supabase is not configured.");
      return;
    }

    setStatus("loading");
    setError(null);
    setChatError(null);

    const requestedChatUserId = searchParams.get("chat");
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    const userId = session?.user.id ?? null;
    const userEmail = session?.user.email?.trim().toLowerCase() ?? null;
    const accessToken = session?.access_token ?? null;

    setCurrentUserId(userId);

    if (!userId) {
      setAnnouncements([]);
      setPendingInvites([]);
      setDirectMessages([]);
      setChatProfiles({});
      setStatus("no-session");
      return;
    }

    if (!accessToken) {
      setAnnouncements([]);
      setPendingInvites([]);
      setDirectMessages([]);
      setChatProfiles({});
      setStatus("error");
      setError("Sign in again to view your inbox.");
      setChatError("Sign in again to view your chats.");
      return;
    }

    const [announcementResponse, membershipResponse, inviteResponse, directMessagesState] = await Promise.all([
      supabase
        .from("user_inbox_messages")
        .select("*")
        .eq("recipient_user_id", userId)
        .order("created_at", { ascending: false }),
      supabase.from("sunday_league_team_members").select("*").eq("player_user_id", userId),
      userEmail
        ? supabase
            .from("sunday_league_team_members")
            .select("*")
            .eq("invite_email", userEmail)
            .eq("source", "captain_invite")
            .eq("status", "pending")
        : Promise.resolve({ data: [], error: null }),
      loadDirectMessagesState(accessToken, userId, requestedChatUserId),
    ]);

    let nextInboxError: string | null = null;
    let nextChatError: string | null = null;

    const nextAnnouncements = announcementResponse.error
      ? []
      : ((announcementResponse.data ?? []) as UserInboxMessage[]);

    if (announcementResponse.error) {
      nextInboxError = isMissingInboxTableError(announcementResponse.error.message)
        ? "Inbox storage is not set up yet. Run data/user-inbox-messages.sql in Supabase first."
        : announcementResponse.error.message ?? "Could not load your inbox.";
    }

    const membershipMap = new Map<string, SundayLeagueTeamMember>();
    for (const response of [membershipResponse, inviteResponse]) {
      if (response.error || !response.data) continue;

      for (const membership of response.data as SundayLeagueTeamMember[]) {
        membershipMap.set(membership.id, membership);
      }
    }

    const inviteMemberships = Array.from(membershipMap.values()).filter(
      (membership) => membership.source === "captain_invite" && membership.status === "pending",
    );
    const teamIds = Array.from(new Set(inviteMemberships.map((membership) => membership.team_id)));
    let teamMap = new Map<string, AccountSundayLeagueTeam>();

    if (teamIds.length > 0) {
      const { data: teamData, error: teamError } = await supabase
        .from("sunday_league_teams")
        .select("id,team_name,team_logo_url")
        .in("id", teamIds);

      if (teamError) {
        nextInboxError = teamError.message ?? nextInboxError ?? "Could not load your team invites.";
      } else {
        teamMap = new Map((teamData ?? []).map((team) => [team.id, team as AccountSundayLeagueTeam]));
      }
    }

    const { nextDirectMessages, nextChatProfiles, nextChatError: directMessagesError } = directMessagesState;
    nextChatError = directMessagesError;

    setAnnouncements(nextAnnouncements);
    setPendingInvites(
      inviteMemberships.map((membership) => ({
        ...membership,
        team: teamMap.get(membership.team_id) ?? null,
      })),
    );
    setDirectMessages(nextDirectMessages);
    setChatProfiles(nextChatProfiles);
    setError(nextInboxError);
    setChatError(nextChatError);
    setStatus("ready");
  }, [loadDirectMessagesState, searchParams]);

  const refreshDirectMessages = useCallback(
    async (userId: string, accessToken: string, requestedChatUserId?: string | null) => {
      const { nextDirectMessages, nextChatProfiles, nextChatError } = await loadDirectMessagesState(
        accessToken,
        userId,
        requestedChatUserId,
      );

      setDirectMessages(nextDirectMessages);
      setChatProfiles(nextChatProfiles);
      setChatError(nextChatError);
    },
    [loadDirectMessagesState],
  );

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    const requestedChatUserId = searchParams.get("chat");
    const nextTab = requestedChatUserId ? "chats" : isChatsTabValue(requestedTab) ? requestedTab : "inbox";
    setActiveTab(nextTab);
    setSelectedChatUserId(requestedChatUserId);
  }, [searchParams]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadMessageCenter();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadMessageCenter]);

  useEffect(() => {
    const client = supabase;
    if (!client || !currentUserId) {
      return;
    }

    const refreshFromRealtime = async () => {
      const { data: sessionData } = await client.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? null;
      if (!accessToken) {
        return;
      }

      await refreshDirectMessages(currentUserId, accessToken, selectedChatUserId);
    };

    const channel = client
      .channel(`account-inbox-direct-messages:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_direct_messages",
          filter: `recipient_user_id=eq.${currentUserId}`,
        },
        () => void refreshFromRealtime(),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_direct_messages",
          filter: `sender_user_id=eq.${currentUserId}`,
        },
        () => void refreshFromRealtime(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_direct_messages",
          filter: `recipient_user_id=eq.${currentUserId}`,
        },
        () => void refreshFromRealtime(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_direct_messages",
          filter: `sender_user_id=eq.${currentUserId}`,
        },
        () => void refreshFromRealtime(),
      )
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === "CHANNEL_ERROR") {
          setChatError((prev) => prev ?? "Realtime chat updates are unavailable right now. Refresh to see new messages.");
        }
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, [currentUserId, refreshDirectMessages, selectedChatUserId]);

  useEffect(() => {
    if (activeTab !== "chats" || selectedChatUserId || status !== "ready") {
      return;
    }

    const conversationPartnerId = Array.from(
      new Set(
        directMessages.map((message) =>
          message.sender_user_id === currentUserId ? message.recipient_user_id : message.sender_user_id,
        ),
      ),
    )[0];

    if (conversationPartnerId) {
      openChat(conversationPartnerId);
    }
  }, [activeTab, currentUserId, directMessages, openChat, selectedChatUserId, status]);

  useEffect(() => {
    const client = supabase;
    if (activeTab !== "chats" || !client || !currentUserId || !selectedChatUserId) {
      return;
    }

    const unreadIds = directMessages
      .filter(
        (message) =>
          message.sender_user_id === selectedChatUserId &&
          message.recipient_user_id === currentUserId &&
          !message.is_read,
      )
      .map((message) => message.id);

    if (unreadIds.length === 0) {
      return;
    }

    const readAt = new Date().toISOString();

    const markRead = async () => {
      setMarkingConversationId(selectedChatUserId);
      const { data: sessionData } = await client.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? null;
      if (!accessToken) {
        setChatError("Sign in again to update your chats.");
        setMarkingConversationId(null);
        return;
      }

      const updateResponse = await markDirectMessagesReadThroughApi(accessToken, unreadIds, readAt);

      if (!updateResponse.ok) {
        setChatError(updateResponse.error ?? "Could not mark chat messages as read.");
      } else {
        setDirectMessages((prev) =>
          prev.map((message) =>
            updateResponse.updatedIds.includes(message.id)
              ? { ...message, is_read: true, read_at: updateResponse.readAt }
              : message,
          ),
        );
      }

      setMarkingConversationId(null);
    };

    void markRead();
  }, [activeTab, currentUserId, directMessages, selectedChatUserId]);

  useEffect(() => {
    const client = supabase;
    if (activeTab !== "chats" || !client || !currentUserId) {
      setMemberSearchResults([]);
      setMemberSearchLoading(false);
      return;
    }

    const trimmedSearch = memberSearch.trim();
    if (!trimmedSearch) {
      setMemberSearchResults([]);
      setMemberSearchLoading(false);
      return;
    }

    let ignore = false;
    const timeoutId = window.setTimeout(() => {
      const runSearch = async () => {
        setMemberSearchLoading(true);
        const { data, error: searchError } = await client
          .from("profiles")
          .select("id,name,avatar_url,sports")
          .ilike("name", `%${trimmedSearch}%`)
          .limit(10);

        if (ignore) return;

        if (searchError || !data) {
          setMemberSearchResults([]);
          setMemberSearchLoading(false);
          return;
        }

        setMemberSearchResults(
          (data as ChatProfile[]).filter((profile) => profile.id !== currentUserId),
        );
        setMemberSearchLoading(false);
      };

      void runSearch();
    }, 250);

    return () => {
      ignore = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeTab, currentUserId, memberSearch]);

  const handleMarkRead = async (messageId: string) => {
    if (!supabase) return;

    setMarkingMessageId(messageId);
    const readAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("user_inbox_messages")
      .update({
        is_read: true,
        read_at: readAt,
      })
      .eq("id", messageId);

    if (updateError) {
      setError(updateError.message ?? "Could not mark that message as read.");
      setMarkingMessageId(null);
      return;
    }

    setAnnouncements((prev) =>
      prev.map((message) => (message.id === messageId ? { ...message, is_read: true, read_at: readAt } : message)),
    );
    setMarkingMessageId(null);
  };

  const handleStartConversation = (profile: ChatProfile) => {
    setChatProfiles((prev) => ({ ...prev, [profile.id]: profile }));
    setMemberSearch("");
    setMemberSearchResults([]);
    openChat(profile.id);
  };

  const handleSendChat = async () => {
    if (!supabase || !currentUserId || !selectedChatUserId) return;

    const message = chatDraft.trim();
    if (!message) return;

    setSendingChat(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token ?? null;
    if (!accessToken) {
      setChatError("Sign in again to send messages.");
      setSendingChat(false);
      return;
    }

    const sendResponse = await sendDirectMessageThroughApi(accessToken, selectedChatUserId, message);

    if (!sendResponse.ok || !sendResponse.message) {
      setChatError(
        isMissingDirectMessagesTableError(sendResponse.error)
          ? "Direct messages are not set up yet. Run the direct messages setup in Supabase first."
          : sendResponse.error ?? "Could not send the message.",
      );
      setSendingChat(false);
      return;
    }

    setDirectMessages((prev) => upsertDirectMessage(prev, sendResponse.message as UserDirectMessage));
    setChatDraft("");
    setSendingChat(false);
  };

  const inboxEntries = useMemo<InboxEntry[]>(() => {
    const announcementEntries: InboxEntry[] = announcements.map((message) => ({
      type: "announcement",
      id: message.id,
      title: message.title,
      message: message.message,
      created_at: message.created_at,
      is_read: Boolean(message.is_read),
      sender_name: message.sender_name ?? null,
    }));

    const inviteEntries: InboxEntry[] = pendingInvites.map((invite) => ({
      type: "invite",
      id: invite.id,
      title: invite.team?.team_name ?? "Sunday League Invite",
      message: `${invite.team?.team_name ?? "A Sunday League team"} invited you to join their roster. Accept or decline it from My Team.`,
      created_at: invite.created_at,
      team: invite.team,
    }));

    return [...announcementEntries, ...inviteEntries].sort((left, right) => {
      const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
      const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
      return rightTime - leftTime;
    });
  }, [announcements, pendingInvites]);

  const conversationSummaries = useMemo<ConversationSummary[]>(() => {
    if (!currentUserId) return [];

    const conversationMap = new Map<string, ConversationSummary>();

    for (const message of directMessages) {
      const partnerId = message.sender_user_id === currentUserId ? message.recipient_user_id : message.sender_user_id;
      const existing = conversationMap.get(partnerId);
      const unreadIncrement =
        message.recipient_user_id === currentUserId && !message.is_read ? 1 : 0;

      if (!existing) {
        conversationMap.set(partnerId, {
          partnerId,
          lastMessage: message,
          unreadCount: unreadIncrement,
        });
        continue;
      }

      const existingTime = existing.lastMessage.created_at ? new Date(existing.lastMessage.created_at).getTime() : 0;
      const messageTime = message.created_at ? new Date(message.created_at).getTime() : 0;

      conversationMap.set(partnerId, {
        partnerId,
        lastMessage: messageTime >= existingTime ? message : existing.lastMessage,
        unreadCount: existing.unreadCount + unreadIncrement,
      });
    }

    return Array.from(conversationMap.values()).sort((left, right) => {
      const leftTime = left.lastMessage.created_at ? new Date(left.lastMessage.created_at).getTime() : 0;
      const rightTime = right.lastMessage.created_at ? new Date(right.lastMessage.created_at).getTime() : 0;
      return rightTime - leftTime;
    });
  }, [currentUserId, directMessages]);

  const selectedChatProfile = selectedChatUserId ? chatProfiles[selectedChatUserId] ?? null : null;

  const selectedConversationMessages = useMemo(() => {
    if (!currentUserId || !selectedChatUserId) return [];

    return directMessages.filter(
      (message) =>
        (message.sender_user_id === currentUserId && message.recipient_user_id === selectedChatUserId) ||
        (message.sender_user_id === selectedChatUserId && message.recipient_user_id === currentUserId),
    );
  }, [currentUserId, directMessages, selectedChatUserId]);

  const unreadInboxCount = announcements.filter((message) => !message.is_read).length + pendingInvites.length;
  const unreadChatCount = directMessages.filter((message) => message.recipient_user_id === currentUserId && !message.is_read).length;
  const unreadCount = unreadInboxCount + unreadChatCount;

  return (
    <>
      <AccessibilityControls />
      <div className="account-page">
        <div className="account-body shell">
          <HistoryBackButton label="← Back" fallbackHref="/account" />

          <header className="account-header">
            <div>
              <p className="eyebrow">Account</p>
              <h1>Inbox</h1>
              <p className="muted">Announcements, invites, and direct messages appear here. Unread: {unreadCount}</p>
            </div>
            <button className="button ghost" type="button" onClick={() => void loadMessageCenter()} disabled={status === "loading"}>
              {status === "loading" ? "Refreshing..." : "Refresh"}
            </button>
          </header>

          <section className="account-card account-tabs-card">
            <div className="account-tabs" role="tablist" aria-label="Inbox sections">
              <button
                className={`account-tabs__button${activeTab === "inbox" ? " is-active" : ""}`}
                type="button"
                onClick={openInboxTab}
              >
                Inbox ({unreadInboxCount})
              </button>
              <button
                className={`account-tabs__button${activeTab === "chats" ? " is-active" : ""}`}
                type="button"
                onClick={() => {
                  setActiveTab("chats");
                  syncRouteState("chats", selectedChatUserId);
                }}
              >
                Chats ({unreadChatCount})
              </button>
            </div>

            {status === "loading" ? <p className="muted">Loading your inbox...</p> : null}
            {status === "no-session" ? <p className="muted">Sign in to view your messages.</p> : null}

            {status === "ready" && activeTab === "inbox" ? (
              <>
                {error ? <p className="form-help error">{error}</p> : null}
                {inboxEntries.length === 0 ? (
                  <p className="muted">No announcements or invites yet.</p>
                ) : (
                  <div className="event-list">
                    {inboxEntries.map((entry) => (
                      <article
                        key={`${entry.type}-${entry.id}`}
                        className={`event-card-simple contact-message-card${
                          entry.type === "announcement" && entry.is_read ? "" : " is-unread"
                        }`}
                      >
                        <div className="event-card__header">
                          <h2>{entry.title}</h2>
                          <div className="cta-row">
                            <span className={`pill ${entry.type === "announcement" && entry.is_read ? "pill--muted" : "pill--accent"}`}>
                              {entry.type === "invite" ? "Invite" : entry.is_read ? "Read" : "Unread"}
                            </span>
                            {entry.type === "announcement" && !entry.is_read ? (
                              <button
                                className="button ghost"
                                type="button"
                                onClick={() => void handleMarkRead(entry.id)}
                                disabled={markingMessageId === entry.id}
                              >
                                {markingMessageId === entry.id ? "Saving..." : "Mark Read"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="event-card__meta">
                          <p className="muted">Received: {formatInboxDate(entry.created_at)}</p>
                        </div>
                        {entry.type === "invite" ? (
                          <div className="account-inbox-invite">
                            <div className="account-inbox-invite__logo">
                              <TeamLogoImage src={entry.team?.team_logo_url ?? null} alt="" fill sizes="72px" />
                            </div>
                            <div className="account-inbox-invite__content">
                              <p className="muted contact-message-card__preview">{entry.message}</p>
                              <div className="cta-row">
                                <Link className="button ghost" href="/account/team">
                                  Open My Team
                                </Link>
                                <Link className="button ghost" href="/leagues/sunday-league">
                                  Sunday League Hub
                                </Link>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="muted contact-message-card__preview">{entry.message}</p>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </>
            ) : null}

            {status === "ready" && activeTab === "chats" ? (
              <>
                {chatError ? <p className="form-help error">{chatError}</p> : null}
                <div className="account-chat-search">
                  <label className="sr-only" htmlFor="member-chat-search">
                    Search members to message
                  </label>
                  <div className="search-panel__input">
                    <input
                      id="member-chat-search"
                      value={memberSearch}
                      onChange={(event) => setMemberSearch(event.target.value)}
                      placeholder="Search members by name"
                      autoComplete="off"
                    />
                  </div>
                  {memberSearch.trim() ? (
                    <div className="admin-recipient-option-list">
                      {memberSearchLoading ? <p className="muted">Searching members...</p> : null}
                      {!memberSearchLoading && memberSearchResults.length === 0 ? (
                        <p className="muted">No members match that search.</p>
                      ) : null}
                      {!memberSearchLoading &&
                        memberSearchResults.map((profile) => (
                          <button
                            key={profile.id}
                            className="admin-recipient-option"
                            type="button"
                            onClick={() => handleStartConversation(profile)}
                          >
                            <strong>{profile.name}</strong>
                            <span>{Array.isArray(profile.sports) && profile.sports.length > 0 ? profile.sports.join(", ") : "Member"}</span>
                          </button>
                        ))}
                    </div>
                  ) : null}
                </div>

                <div className="account-chat-layout">
                  <div className="account-chat-sidebar">
                    <div className="account-chat-sidebar__header">
                      <h2>Conversations</h2>
                      <p className="muted">Open a chat or start one from a profile.</p>
                    </div>
                    {conversationSummaries.length === 0 ? (
                      <p className="muted">No chats yet.</p>
                    ) : (
                      <div className="account-chat-conversation-list">
                        {conversationSummaries.map((conversation) => {
                          const partner = chatProfiles[conversation.partnerId];
                          const isActive = selectedChatUserId === conversation.partnerId;
                          const preview = conversation.lastMessage.message.trim();
                          const isOutgoing = conversation.lastMessage.sender_user_id === currentUserId;
                          return (
                            <button
                              key={conversation.partnerId}
                              className={`account-chat-conversation${isActive ? " is-active" : ""}`}
                              type="button"
                              onClick={() => openChat(conversation.partnerId)}
                            >
                              <div className="account-chat-conversation__avatar">
                                <img src={partner?.avatar_url ?? "/avatar-placeholder.svg"} alt="" />
                              </div>
                              <div className="account-chat-conversation__body">
                                <div className="account-chat-conversation__header">
                                  <strong>{partner?.name ?? "Member"}</strong>
                                  {conversation.unreadCount > 0 ? <span className="pill pill--accent">{conversation.unreadCount}</span> : null}
                                </div>
                                <p className="muted">
                                  {isOutgoing ? "You: " : ""}
                                  {preview.length > 72 ? `${preview.slice(0, 72)}...` : preview}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="account-chat-panel">
                    {selectedChatUserId && selectedChatProfile ? (
                      <>
                        <div className="account-chat-panel__header">
                          <div className="account-chat-panel__person">
                            <div className="account-chat-panel__avatar">
                              <img src={selectedChatProfile.avatar_url ?? "/avatar-placeholder.svg"} alt="" />
                            </div>
                            <div>
                              <h2>{selectedChatProfile.name}</h2>
                              <p className="muted">
                                {Array.isArray(selectedChatProfile.sports) && selectedChatProfile.sports.length > 0
                                  ? selectedChatProfile.sports.join(", ")
                                  : "Member"}
                              </p>
                            </div>
                          </div>
                          <div className="cta-row">
                            {markingConversationId === selectedChatUserId ? <p className="muted">Updating read status...</p> : null}
                            <Link className="button ghost" href={`/profiles/${selectedChatProfile.id}`}>
                              View Profile
                            </Link>
                          </div>
                        </div>

                        <div className="account-chat-thread">
                          {selectedConversationMessages.length === 0 ? (
                            <p className="muted">No messages yet. Start the conversation below.</p>
                          ) : (
                            selectedConversationMessages.map((message) => {
                              const isOwnMessage = message.sender_user_id === currentUserId;
                              return (
                                <div
                                  key={message.id}
                                  className={`account-chat-bubble${isOwnMessage ? " is-own" : ""}`}
                                >
                                  <p>{message.message}</p>
                                  <span>{formatInboxDate(message.created_at)}</span>
                                </div>
                              );
                            })
                          )}
                        </div>

                        <div className="account-chat-composer">
                          <textarea
                            value={chatDraft}
                            onChange={(event) => setChatDraft(event.target.value)}
                            rows={4}
                            placeholder={`Message ${selectedChatProfile.name}...`}
                          />
                          <div className="cta-row">
                            <button
                              className="button primary"
                              type="button"
                              onClick={() => void handleSendChat()}
                              disabled={sendingChat || !chatDraft.trim()}
                            >
                              {sendingChat ? "Sending..." : "Send Message"}
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="account-chat-empty">
                        <h2>Start a chat</h2>
                        <p className="muted">Choose a conversation from the left or search for a member above.</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </section>
        </div>
      </div>
    </>
  );
}

export default function AccountInboxPage() {
  return (
    <Suspense
      fallback={
        <>
          <AccessibilityControls />
          <div className="account-page">
            <div className="account-body shell">
              <HistoryBackButton label="← Back" fallbackHref="/account" />
              <section className="account-card">
                <p className="muted">Loading your inbox...</p>
              </section>
            </div>
          </div>
        </>
      }
    >
      <AccountInboxContent />
    </Suspense>
  );
}
