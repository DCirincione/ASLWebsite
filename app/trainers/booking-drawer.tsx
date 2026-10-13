"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { TrainerProfile } from "@/lib/trainers";
import { supabase } from "@/lib/supabase/client";
import { participantWaiver } from "./marketing";
import { safeBookingUrl } from "@/lib/trainer-network";
import BookingAvailability, { type BookingSlot } from "./booking-availability";

export default function BookingDrawer({ trainer, onClose }: { trainer: TrainerProfile; onClose: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  const [slotId, setSlotId] = useState(""), [session, setSession] = useState(""), [who, setWho] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const checkoutId = useRef<string | null>(null);
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const referral = trainer.network.booking_mode === "referral";
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; dialog.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => {
    if (referral) return;
    const abort = new AbortController();
    fetch(`/api/trainers/availability?trainerId=${encodeURIComponent(trainer.id)}`, { signal: abort.signal }).then(async r => { const json = await r.json(); if (!r.ok) throw new Error(json.error); setSlots(json.slots); }).catch(e => { if (e.name !== "AbortError") setError("Could not load availability. Close this panel and try again."); }).finally(() => setLoading(false));
    return () => abort.abort();
  }, [trainer.id, referral]);
  const option = trainer.sessionTypes.find(o => o.name === session);
  const matchingSlots = slots.filter(s => !option || (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000 === (option.durationMinutes || parseDuration(option.duration)));
  const slot = matchingSlots.find(s => s.id === slotId);
  const amount = option ? (option.priceCents ?? Math.round(Number(option.price.replace(/[$,]/g, "")) * 100)) : 0;
  const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  async function pay(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      const auth = (await supabase?.auth.getSession())?.data.session;
      if (!auth) throw new Error("Please sign in using the account button before booking.");
      checkoutId.current ??= crypto.randomUUID();
      const response = await fetch("/api/trainers/checkout", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.access_token}` }, body: JSON.stringify({ ...Object.fromEntries(form.entries()), trainerId: trainer.id, availabilitySlotId: slotId, sessionOptionName: session, participantType: who, waiverAccepted: form.get("waiverAccepted") === "on", checkoutId: checkoutId.current }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not start checkout.");
      window.location.assign(result.url);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start checkout."); setBusy(false); }
  }
  return <><div className="scrim" onClick={onClose} /><aside ref={dialog} tabIndex={-1} className="drawer" role="dialog" aria-modal="true" aria-labelledby="booking-title" onKeyDown={e => {
    if (e.key === "Escape") onClose();
    if (e.key === "Tab") { const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea, summary') ?? []).filter(el => el.getClientRects().length); const first = items[0], last = items.at(-1); if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
  }}><div className="drawer-header"><div><h2 id="booking-title">{trainer.name}</h2><p>{trainer.sport} · {referral ? "Referral partner" : trainer.network.level}</p></div><button className="x" onClick={onClose} aria-label="Close booking">×</button></div>
    {referral ? <><h3>Book directly with this partner</h3><p>The partner handles scheduling, payments and waivers on their own site.</p>{trainer.network.referral_code && <div className="code-row"><span className="code">{trainer.network.referral_code}</span><span>{trainer.network.referral_discount}</span></div>}{safeBookingUrl(trainer.network.booking_url) ? <a className="btn btn-orange" href={safeBookingUrl(trainer.network.booking_url)!} target="_blank" rel="noopener noreferrer">Continue to partner’s booking site ↗</a> : <p>The partner’s booking link is not available yet.</p>}</> : <form onSubmit={pay}><h3>1 · PICK A TIME</h3><label className="field">Session<select required value={session} onChange={e => { setSession(e.target.value); setSlotId(""); checkoutId.current = null; }}><option value="">Choose a session</option>{trainer.sessionTypes.map(o => <option key={o.name} value={o.name}>{o.name} · {o.duration} · {o.price}</option>)}</select></label>{loading ? <p role="status">Loading open times…</p> : matchingSlots.length ? <BookingAvailability key={session} slots={matchingSlots} selectedSlotId={slotId} fallbackLocation={trainer.location} onSelectSlot={id => { setSlotId(id); checkoutId.current = null; }} /> : <p>{slots.length ? "No open times for this session. Try another session option." : "No open times right now. Check back soon."}</p>}

    <h3>2 · WHO’S TRAINING?</h3><div className="seg">{[["self", "Myself"], ["child", "My child"], ["other", "Another adult"]].map(([id, label]) => <button type="button" key={id} aria-pressed={who === id} onClick={() => { setWho(id); checkoutId.current = null; }}>{label}</button>)}</div>
    {who && <><label className="field">{who === "child" ? "Child’s full name" : "Athlete’s full name"}<input name="participantName" required maxLength={150} /></label>{who === "child" && <label className="field">Child’s age<input name="participantAge" type="number" min="4" max="17" required /></label>}<label className="field">{who === "child" ? "Parent or legal guardian’s full name" : "Name of person booking"}<input name="customerName" required maxLength={150} /></label><label className="field">Booking email<input name="customerEmail" type="email" required maxLength={254} /></label><label className="field">Phone<input name="customerPhone" type="tel" required maxLength={40} /></label>{trainer.network.travel_areas && <label className="field">Training location / travel notes<textarea name="notes" maxLength={1000} /></label>}</>}
    <h3>3 · WAIVER</h3>{who ? <div key={who}><details><summary>Read the Aldrich Sports Participant Waiver</summary><div dangerouslySetInnerHTML={{ __html: participantWaiver }} /></details>{who === "other" && <p>The adult athlete must read and sign this section themselves before you pay. You cannot sign for another adult.</p>}<label className="check"><input name="waiverAccepted" type="checkbox" required />{who === "child" ? "As the parent or legal guardian, I have read and accept this waiver on my child’s behalf." : "As the adult athlete, I have read and accept this waiver."}</label><label className="field">{who === "child" ? "Parent or guardian’s signature" : "Adult athlete’s signature"}<input name="signature" required maxLength={150} placeholder="Type your full name to sign" /></label></div> : <p>Choose who’s training to see the waiver.</p>}
    <h3>4 · REVIEW AND PAY</h3><div className="receipt">{slot && option && amount > 0 ? <><div><span>Session</span><b>{money(amount)}</b></div><div><span>Venue fee</span><b>{money(slot.venue_fee_cents)}</b></div><div><span>Total</span><b>{money(amount + slot.venue_fee_cents)}</b></div></> : <p>Choose a session and time to see the total.</p>}</div><button className="btn btn-orange" disabled={busy || !slot || !option || !who || !(amount > 0)}>{busy ? "Opening secure checkout…" : "Pay and book"}</button><p>Payment is collected securely by Square. Your session is confirmed after payment.</p>{error && <p role="alert">{error}</p>}</form>}
  </aside></>;
}
function parseDuration(value: string) { const h = value.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hour)/i), m = value.match(/(\d+)\s*(?:m|min)/i); return h || m ? Number(h?.[1] ?? 0) * 60 + Number(m?.[1] ?? 0) : Number(value); }
