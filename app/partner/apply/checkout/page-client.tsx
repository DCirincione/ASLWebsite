"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { HistoryBackButton } from "@/components/history-back-button";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/lib/supabase/client";

type PartnerApplicationCheckoutPageClientProps = {
  draftId: string | null;
};

type DraftStatus = "loading" | "pending" | "completed" | "failed" | "expired" | "error" | "no-session";

export default function PartnerApplicationCheckoutPageClient({
  draftId,
}: PartnerApplicationCheckoutPageClientProps) {
  const router = useRouter();
  const [draftStatus, setDraftStatus] = useState<DraftStatus>(draftId ? "loading" : "error");
  const [draftError, setDraftError] = useState<string | null>(draftId ? null : "Application checkout draft not found.");

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

      const response = await fetch(`/api/partner/apply?draftId=${encodeURIComponent(draftId)}`, {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });
      const json = (await response.json().catch(() => null)) as
        | {
            error?: string;
            status?: DraftStatus;
          }
        | null;

      if (!response.ok) {
        if (!cancelled) {
          setDraftStatus("error");
          setDraftError(json?.error ?? "Could not load the partner application checkout status.");
        }
        return;
      }

      const nextStatus = json?.status ?? "pending";
      if (cancelled) return;

      setDraftStatus(nextStatus);
      setDraftError(json?.error ?? null);

      if (nextStatus === "pending" || nextStatus === "loading") {
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
  }, [draftId]);

  return (
    <PageShell>
      <section className="section sunday-league-flow-page">
        <div className="sunday-league-flow-card">
          <p className="eyebrow">Partner Application</p>
          <h1>Confirming Your Application Payment</h1>
          <p className="muted">
            Square sent you back here after checkout. We are waiting for payment confirmation before sending your
            partnership application to the admin review inbox.
          </p>

          {draftStatus === "loading" ? <p className="muted">Checking payment status...</p> : null}
          {draftStatus === "no-session" ? <p className="form-help error">Sign in again to continue to your partner application.</p> : null}
          {draftStatus === "pending" ? (
            <p className="muted">Payment is still being confirmed. This page refreshes automatically.</p>
          ) : null}
          {draftStatus === "completed" ? (
            <p className="muted">Your payment was confirmed and your partnership application was submitted for review.</p>
          ) : null}
          {(draftStatus === "failed" || draftStatus === "expired" || draftStatus === "error") ? (
            <p className="form-help error">{draftError ?? "We could not confirm your payment."}</p>
          ) : null}

          <div className="sunday-league-inline-actions">
            {draftStatus === "completed" ? (
              <button className="button primary" type="button" onClick={() => router.push("/partner")}>
                Back to Partner Portal
              </button>
            ) : null}
            <HistoryBackButton label="Back to Partner Portal" fallbackHref="/partner" />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
