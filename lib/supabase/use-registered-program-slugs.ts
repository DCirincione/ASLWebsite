"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase/client";

type SubmissionRow = {
  program_id: string;
};

type ProgramRow = {
  id: string;
  slug: string | null;
};

const normalizeSlug = (value?: string | null) => (value ?? "").trim().toLowerCase();

export function useRegisteredProgramSlugs() {
  const [userId, setUserId] = useState<string | null>(null);
  const [registeredSlugs, setRegisteredSlugs] = useState<Set<string>>(new Set());

  const loadRegisteredSlugs = useCallback(async (uid: string | null) => {
    const client = supabase;
    if (!client || !uid) {
      setRegisteredSlugs(new Set());
      return;
    }

    const { data: submissions, error: submissionsError } = await client
      .from("registration_submissions")
      .select("program_id")
      .eq("user_id", uid);

    if (submissionsError) {
      setRegisteredSlugs(new Set());
      return;
    }

    const programIds = Array.from(
      new Set((submissions as SubmissionRow[]).map((row) => row.program_id).filter(Boolean))
    );

    if (programIds.length === 0) {
      setRegisteredSlugs(new Set());
      return;
    }

    const { data: programs, error: programsError } = await client
      .from("registration_programs")
      .select("id,slug")
      .in("id", programIds);

    if (programsError) {
      setRegisteredSlugs(new Set());
      return;
    }

    const slugSet = new Set(
      (programs as ProgramRow[])
        .map((row) => normalizeSlug(row.slug))
        .filter(Boolean)
    );
    setRegisteredSlugs(slugSet);
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    client.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      loadRegisteredSlugs(uid);
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user.id ?? null;
      setUserId(uid);
      loadRegisteredSlugs(uid);
    });

    return () => {
      subscription?.subscription.unsubscribe();
    };
  }, [loadRegisteredSlugs]);

  const isRegisteredSlug = useCallback(
    (slug?: string | null) => {
      const normalized = normalizeSlug(slug);
      return normalized.length > 0 && registeredSlugs.has(normalized);
    },
    [registeredSlugs]
  );

  const refreshRegisteredSlugs = useCallback(() => {
    return loadRegisteredSlugs(userId);
  }, [loadRegisteredSlugs, userId]);

  return {
    registeredSlugs,
    isRegisteredSlug,
    refreshRegisteredSlugs,
  };
}
