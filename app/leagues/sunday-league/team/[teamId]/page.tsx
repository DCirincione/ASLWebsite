"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { TeamLogoImage } from "@/components/team-logo-image";
import { getSundayLeagueAgreement, getSundayLeagueColor } from "@/lib/sunday-league";
import { supabase } from "@/lib/supabase/client";
import type { SundayLeagueTeam } from "@/lib/supabase/types";

const agreementLabels = [
  { key: "captain_confirmed", label: "Captain or manager authorization confirmed" },
  { key: "deposit_required", label: "$100 deposit acknowledgement" },
  { key: "balance_due", label: "Remaining balance due first Sunday" },
  { key: "approval_not_guaranteed", label: "Approval pending payment and league requirements" },
  { key: "rules_accepted", label: "Rules and roster policies accepted" },
] as const;

export default function SundayLeagueTeamPortalPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;
  const [team, setTeam] = useState<SundayLeagueTeam | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "no-session">("loading");

  useEffect(() => {
    const loadTeam = async () => {
      if (!supabase || !teamId) {
        setStatus("error");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        setStatus("no-session");
        return;
      }

      const { data, error } = await supabase
        .from("sunday_league_teams")
        .select("*")
        .eq("id", teamId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error || !data) {
        setStatus("error");
        return;
      }

      setTeam(data as SundayLeagueTeam);
      setStatus("ready");
    };

    void loadTeam();
  }, [teamId]);

  const rosterRows = useMemo(() => {
    const captainRow = team?.captain_is_playing ? `${team.captain_name} (Captain)` : null;
    return Array.from({ length: 15 }, (_, index) => {
      if (index === 0 && captainRow) return captainRow;
      return "Open roster slot";
    });
  }, [team]);

  return (
    <PageShell>
      <section className="section sunday-league-flow-page">
        <div className="sunday-league-flow-card">
          <p className="eyebrow">Your Sunday League Team</p>
          <h1>{team?.team_name ?? "Team Portal"}</h1>
          <p className="muted">Captain summary, jersey plan, and roster placeholders for your Aldrich Sunday League team.</p>

          {status === "loading" ? <p className="muted">Loading your team portal...</p> : null}
          {status === "no-session" ? <p className="form-help error">Sign in to view your team portal.</p> : null}
          {status === "error" ? <p className="form-help error">We could not load this team portal.</p> : null}

          {team ? (
            <>
              <div className="sunday-league-portal-grid">
                <article className="sunday-league-flow-summary__card">
                  <div className="sunday-league-portal-logo">
                    <TeamLogoImage src={team.team_logo_url} alt="" fill sizes="128px" />
                  </div>
                  <h2>{team.team_name}</h2>
                  <p>Division {team.division}</p>
                  <p>Slot {team.slot_number}</p>
                  <p>Captain: {team.captain_name}</p>
                  <p>Status: {team.deposit_status === "paid" ? "Deposit paid" : "Deposit pending"}</p>
                </article>

                <article className="sunday-league-flow-summary__card">
                  <h3>Team Details</h3>
                  <p>Captain email: {team.captain_email}</p>
                  <p>Captain phone: {team.captain_phone}</p>
                  <p>Playing: {team.captain_is_playing ? "Yes" : "No, manager only"}</p>
                  <p>Primary jersey: {getSundayLeagueColor(team.preferred_jersey_colors, "primary") || "TBD"}</p>
                  <p>Secondary jersey: {getSundayLeagueColor(team.preferred_jersey_colors, "secondary") || "TBD"}</p>
                  <p>Accent color: {getSundayLeagueColor(team.preferred_jersey_colors, "accent") || "None"}</p>
                  <p>Design/style: {team.preferred_jersey_design || "TBD"}</p>
                </article>
              </div>

              <div className="sunday-league-portal-grid">
                <article className="sunday-league-flow-summary__card">
                  <h3>Included Jersey Numbers</h3>
                  <div className="sunday-league-number-grid">
                    {(team.jersey_numbers ?? []).map((number, index) => (
                      <div key={`${number}-${index}`} className="sunday-league-number-chip">
                        <span>#{number || "TBD"}</span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="sunday-league-flow-summary__card">
                  <h3>Captain Agreements</h3>
                  <div className="sunday-league-checkbox-list sunday-league-checkbox-list--static">
                    {agreementLabels.map((agreement) => (
                      <p key={agreement.key} className="muted">
                        {getSundayLeagueAgreement(team.agreements, agreement.key) ? "Accepted" : "Missing"}: {agreement.label}
                      </p>
                    ))}
                  </div>
                </article>
              </div>

              <article className="sunday-league-flow-summary__card">
                <h3>Roster Page</h3>
                <p className="muted">Use this as the captain-facing home for roster edits and league admin follow-up.</p>
                <div className="sunday-league-roster-list">
                  {rosterRows.map((player, index) => (
                    <div key={`${player}-${index}`} className="sunday-league-roster-row">
                      <span>Player {index + 1}</span>
                      <span>{player}</span>
                    </div>
                  ))}
                </div>
              </article>
            </>
          ) : null}

          <div className="sunday-league-inline-actions">
            {team ? (
              <Link className="button primary" href={`/leagues/sunday-league/deposit?teamId=${team.id}`}>
                Deposit Page
              </Link>
            ) : null}
            <Link className="button ghost" href="/leagues/sunday-league">
              Back to League Hub
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
