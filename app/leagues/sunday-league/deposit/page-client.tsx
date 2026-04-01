"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { HistoryBackButton } from "@/components/history-back-button";
import { PageShell } from "@/components/page-shell";
import { getSundayLeagueColor } from "@/lib/sunday-league";
import { supabase } from "@/lib/supabase/client";
import type { SundayLeagueTeam } from "@/lib/supabase/types";

type SundayLeagueDepositPageClientProps = {
  teamId: string | null;
  draftId: string | null;
};

type DraftStatus = "loading" | "pending" | "paid" | "completed" | "failed" | "expired" | "error" | "no-session";

export default function SundayLeagueDepositPageClient({ teamId, draftId }: SundayLeagueDepositPageClientProps) {
  const router = useRouter();
  const [team, setTeam] = useState<SundayLeagueTeam | null>(null);
  const [teamStatus, setTeamStatus] = useState<"loading" | "ready" | "error" | "no-session">("loading");
  const [draftStatus, setDraftStatus] = useState<DraftStatus>(draftId ? "loading" : "pending");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [resolvedTeamId, setResolvedTeamId] = useState<string | null>(teamId);

  useEffect(() => {
    if (draftId) return;

    const loadTeam = async () => {
      if (!supabase || !teamId) {
        setTeamStatus("error");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        setTeamStatus("no-session");
        return;
      }

      const { data, error } = await supabase
        .from("sunday_league_teams")
        .select("*")
        .eq("id", teamId)
        .maybeSingle();

      if (error || !data) {
        setTeamStatus("error");
        return;
      }

      const nextTeam = data as SundayLeagueTeam;
      if (nextTeam.user_id !== userId) {
        const { data: roleData } = await supabase
          .from("sunday_league_team_members")
          .select("id")
          .eq("team_id", nextTeam.id)
          .eq("player_user_id", userId)
          .eq("status", "accepted")
          .eq("role", "co_captain")
          .limit(1);

        if ((roleData ?? []).length === 0) {
          setTeamStatus("error");
          return;
        }
      }

      setTeam(nextTeam);
      setResolvedTeamId(nextTeam.id);
      setTeamStatus("ready");
    };

    void loadTeam();
  }, [draftId, teamId]);

  useEffect(() => {
    if (!draftId || !supabase) return;
    const client = supabase;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const loadDraft = async () => {
      const { data: sessionData } = await client.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? null;
      if (!accessToken) {
        if (!cancelled) {
          setDraftStatus("no-session");
        }
        return;
      }

      const response = await fetch(`/api/sunday-league/team-checkout?draftId=${encodeURIComponent(draftId)}`, {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });
      const json = (await response.json().catch(() => null)) as
        | {
            error?: string;
            status?: DraftStatus;
            teamId?: string | null;
          }
        | null;

      if (!response.ok) {
        if (!cancelled) {
          setDraftStatus("error");
          setDraftError(json?.error ?? "Could not load the Sunday League checkout status.");
        }
        return;
      }

      const nextStatus = json?.status ?? "pending";
      if (cancelled) return;

      setDraftStatus(nextStatus);
      setDraftError(json?.error ?? null);

      if (json?.teamId) {
        setResolvedTeamId(json.teamId);
        router.replace(`/leagues/sunday-league/team/${json.teamId}`);
        return;
      }

      if (nextStatus === "pending" || nextStatus === "paid" || nextStatus === "loading") {
        timeoutId = setTimeout(() => {
          void loadDraft();
        }, 2500);
      }
    };

    void loadDraft();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [draftId, router]);

  const title = draftId ? "Confirming Your Deposit" : "Reserve Your Team Spot";
  const intro = draftId
    ? "Square sent you back here after checkout. We are waiting for payment confirmation before creating your Sunday League team in Supabase."
    : "A $100 deposit is required to hold your Sunday League slot. Connect your payment processor or hosted checkout link here when ready.";

  return (
    <PageShell>
      <section className="section sunday-league-flow-page">
        <div className="sunday-league-flow-card">
          <p className="eyebrow">Deposit Payment Page</p>
          <h1>{title}</h1>
          <p className="muted">{intro}</p>

          {!draftId && teamStatus === "loading" ? <p className="muted">Loading team reservation...</p> : null}
          {!draftId && teamStatus === "no-session" ? <p className="form-help error">Sign in to continue to your deposit page.</p> : null}
          {!draftId && teamStatus === "error" ? <p className="form-help error">We could not load that team reservation.</p> : null}

          {draftId && draftStatus === "loading" ? <p className="muted">Checking payment status...</p> : null}
          {draftId && draftStatus === "no-session" ? <p className="form-help error">Sign in again to continue to your Sunday League deposit page.</p> : null}
          {draftId && (draftStatus === "pending" || draftStatus === "paid") ? (
            <p className="muted">Payment received by Square is still being confirmed. This page refreshes automatically.</p>
          ) : null}
          {draftId && (draftStatus === "failed" || draftStatus === "expired" || draftStatus === "error") ? (
            <p className="form-help error">{draftError ?? "We could not confirm your payment."}</p>
          ) : null}

          {team ? (
            <div className="sunday-league-flow-summary">
              <div className="sunday-league-flow-summary__card">
                <h2>{team.team_name}</h2>
                <p>Captain: {team.captain_name}</p>
                <p>Primary jersey: {getSundayLeagueColor(team.preferred_jersey_colors, "primary") || "TBD"}</p>
              </div>
              <div className="sunday-league-flow-summary__card">
                <h3>What happens next</h3>
                <p>1. Collect the $100 deposit through Square checkout.</p>
                <p>2. Confirm payment and create the team in Supabase.</p>
                <p>3. Send the captain or co-captain into the roster portal.</p>
              </div>
            </div>
          ) : null}

          <div className="sunday-league-inline-actions">
            {resolvedTeamId ? (
              <button className="button primary" type="button" onClick={() => router.push(`/leagues/sunday-league/team/${resolvedTeamId}`)}>
                Continue to Your Sunday League Team
              </button>
            ) : null}
            <HistoryBackButton label="Back to League Hub" fallbackHref="/leagues/sunday-league" />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
