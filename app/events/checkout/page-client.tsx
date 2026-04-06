"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { supabase } from "@/lib/supabase/client";

type EventCheckoutPageClientProps = {
  draftId: string | null;
};

type DraftStatus = "loading" | "pending" | "paid" | "completed" | "failed" | "expired" | "error" | "no-session";

export default function EventCheckoutPageClient({ draftId }: EventCheckoutPageClientProps) {
  const router = useRouter();
  const goToEvents = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("eventCheckoutDraftId");
    }
    router.push("/events");
  };
  const [clientDraftId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;

    const searchDraftId = new URLSearchParams(window.location.search).get("draftId")?.trim() || "";
    const storedDraftId = window.sessionStorage.getItem("eventCheckoutDraftId")?.trim() || "";
    return searchDraftId || storedDraftId || null;
  });
  const resolvedDraftId = draftId || clientDraftId;
  const [draftStatus, setDraftStatus] = useState<DraftStatus>(resolvedDraftId ? "loading" : "error");
  const [draftError, setDraftError] = useState<string | null>(resolvedDraftId ? null : "Checkout draft not found.");

  useEffect(() => {
    if (!resolvedDraftId || !supabase) return;
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

      const response = await fetch(`/api/events/checkout?draftId=${encodeURIComponent(resolvedDraftId)}`, {
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
          setDraftError(json?.error ?? "Could not load the event checkout status.");
        }
        return;
      }

      const nextStatus = json?.status ?? "pending";
      if (cancelled) return;

      setDraftStatus(nextStatus);
      setDraftError(json?.error ?? null);

      if (
        nextStatus === "completed" ||
        nextStatus === "failed" ||
        nextStatus === "expired" ||
        nextStatus === "error"
      ) {
        window.sessionStorage.removeItem("eventCheckoutDraftId");
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
  }, [resolvedDraftId]);

  return (
    <PageShell>
      <section className="section sunday-league-flow-page">
        <div className="sunday-league-flow-card">
          <p className="eyebrow">Event Payment Page</p>
          <h1>Confirming Your Registration Payment</h1>
          <p className="muted">Square sent you back here after checkout. We are waiting for payment confirmation before finalizing your event signup.</p>

          {draftStatus === "loading" ? <p className="muted">Checking payment status...</p> : null}
          {draftStatus === "no-session" ? <p className="form-help error">Sign in again to continue to your event payment page.</p> : null}
          {(draftStatus === "pending" || draftStatus === "paid") ? (
            <p className="muted">Payment received by Square is still being confirmed. This page refreshes automatically.</p>
          ) : null}
          {draftStatus === "completed" ? (
            <p className="muted">Your payment was confirmed and your registration was submitted successfully.</p>
          ) : null}
          {(draftStatus === "failed" || draftStatus === "expired" || draftStatus === "error") ? (
            <p className="form-help error">{draftError ?? "We could not confirm your payment."}</p>
          ) : null}

          <div className="sunday-league-inline-actions">
            {draftStatus === "completed" ? (
              <button className="button primary" type="button" onClick={() => router.push("/account/events")}>
                Go to My Events
              </button>
            ) : null}
            <button className="button ghost" type="button" onClick={goToEvents}>
              Back to Events
            </button>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
