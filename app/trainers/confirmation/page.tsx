"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/lib/supabase/client";
export default function Confirmation() {
  const [message, setMessage] = useState("Verifying your payment…"), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const session = (await supabase?.auth.getSession())?.data.session;
        const id = new URLSearchParams(window.location.search).get("id") || "";
        const res = await fetch(`/api/trainers/checkout/status?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
        const json = await res.json(); if (!res.ok) throw new Error(json.error);
        if (active) setMessage(json.status === "paid" ? "Payment received. Your training session is confirmed." : "Your payment has not been confirmed yet. If you just paid, check again in a moment.");
      } catch (e) { if (active) setMessage(e instanceof Error ? e.message : "Could not verify payment."); }
    })();
    return () => { active = false; };
  }, [retry]);
  return <PageShell><section><h1>Your training booking</h1><p role="status">{message}</p><button className="button ghost" onClick={() => setRetry(n => n + 1)}>Check payment status</button> <Link href="/trainers">Back to trainers</Link></section></PageShell>;
}
