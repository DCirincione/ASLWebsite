"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase/client";

type SubmissionRow = {
  event_id: string;
};

export function useRegisteredEventIds() {
  const [userId, setUserId] = useState<string | null>(null);
  const [registeredEventIds, setRegisteredEventIds] = useState<Set<string>>(new Set());

  const loadRegisteredEvents = useCallback(async (uid: string | null) => {
    const client = supabase;
    if (!client || !uid) {
      setRegisteredEventIds(new Set());
      return;
    }

    const { data: submissions, error: submissionsError } = await client
      .from("event_submissions")
      .select("event_id")
      .eq("user_id", uid);

    if (submissionsError) {
      setRegisteredEventIds(new Set());
      return;
    }

    const eventIds = Array.from(
      new Set((submissions as SubmissionRow[]).map((row) => row.event_id).filter(Boolean))
    );

    setRegisteredEventIds(new Set(eventIds));
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    client.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      loadRegisteredEvents(uid);
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user.id ?? null;
      setUserId(uid);
      loadRegisteredEvents(uid);
    });

    return () => {
      subscription?.subscription.unsubscribe();
    };
  }, [loadRegisteredEvents]);

  const isRegisteredEvent = useCallback(
    (eventId?: string | null) => {
      const normalized = (eventId ?? "").trim();
      return normalized.length > 0 && registeredEventIds.has(normalized);
    },
    [registeredEventIds]
  );

  const refreshRegisteredEvents = useCallback(() => {
    return loadRegisteredEvents(userId);
  }, [loadRegisteredEvents, userId]);

  return {
    registeredEventIds,
    isRegisteredEvent,
    refreshRegisteredEvents,
  };
}
