"use client";

import { useCallback, useEffect, useState } from "react";

import {
  filterEffectiveRegisteredSubmissions,
  getBestSuccessfulRegistrationDraftBySubmissionId,
  type EffectiveRegistrationDraftRow,
  type EffectiveRegistrationEventRow,
  type EffectiveRegistrationSubmissionRow,
} from "@/lib/effective-event-registrations";
import { supabase } from "@/lib/supabase/client";

type SubmissionRow = EffectiveRegistrationSubmissionRow;

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
      .select("id,event_id")
      .eq("user_id", uid);

    if (submissionsError) {
      setRegisteredEventIds(new Set());
      return;
    }

    const submissionRows = (submissions ?? []) as SubmissionRow[];
    const eventIds = Array.from(new Set(submissionRows.map((row) => row.event_id).filter(Boolean)));

    if (eventIds.length === 0) {
      setRegisteredEventIds(new Set());
      return;
    }

    const submissionIds = submissionRows.map((row) => row.id).filter(Boolean);
    const [{ data: eventRows, error: eventsError }, { data: draftRows, error: draftsError }] = await Promise.all([
      client.from("events").select("id,payment_required,payment_amount_cents").in("id", eventIds),
      submissionIds.length > 0
        ? client
            .from("event_checkout_drafts")
            .select("submission_id,status,updated_at,created_at")
            .in("submission_id", submissionIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (eventsError || draftsError) {
      setRegisteredEventIds(new Set());
      return;
    }

    const eventsById = new Map(
      ((eventRows ?? []) as EffectiveRegistrationEventRow[]).map((row) => [row.id, row]),
    );
    const successfulDraftBySubmissionId = getBestSuccessfulRegistrationDraftBySubmissionId(
      (draftRows ?? []) as EffectiveRegistrationDraftRow[],
    );
    const effectiveSubmissions = filterEffectiveRegisteredSubmissions(
      submissionRows,
      eventsById,
      successfulDraftBySubmissionId,
    );

    setRegisteredEventIds(new Set(effectiveSubmissions.map((row) => row.event_id)));
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
