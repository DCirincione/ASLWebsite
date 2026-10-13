"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { trainerTerms } from "./marketing";
import { supabase } from "@/lib/supabase/client";

function Choices({ name, label, options, single = false }: { name: string; label: string; options: string[]; single?: boolean }) {
  return <fieldset><legend>{label}</legend><div className="form-chips">{options.map(o => <label key={o}><input type={single ? "radio" : "checkbox"} name={name} value={o} required={single} />{o}</label>)}</div></fieldset>;
}
export default function TrainerApplication({ sports, locations }: { sports: string[]; locations: string[] }) {
  const [mode, setMode] = useState("network"), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [done, setDone] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(e.currentTarget);
    try {
      const session = (await supabase?.auth.getSession())?.data.session;
      if (!session) throw new Error("Sign in using the account button, then submit your application. Your answers will stay here.");
      const body = Object.fromEntries(form.entries());
      const response = await fetch("/api/trainers/applications", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ ...body, booking_mode: mode, terms_accepted: form.get("terms_accepted") === "on", sports: form.getAll("sports"), locations: form.getAll("locations"), playing_levels: form.getAll("playing_levels"), coaching_experience: form.getAll("coaching_experience") }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not submit application.");
      setDone(true); setMessage("Application received. Aldrich will review your information and arrange an interview before your profile goes live.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not submit application."); } finally { setBusy(false); }
  }
  return <section id="apply"><div className="wrap apply"><div><div className="eyebrow">Apply</div><h2>Apply to train<br />with Aldrich</h2><p>Tell us about yourself. We’ll set up a short interview with Joe or Francis.</p><ol className="steps" style={{ gridTemplateColumns: "1fr", gap: 20 }}><li><b>Apply</b><p>Tell us about your experience.</p></li><li><b>Interview</b><p>A quick call or meet-up with Joe or Francis.</p></li><li><b>Profile goes live</b><p>We confirm your profile and level.</p></li><li><b>Set your availability</b><p>Manage your schedule in your Trainer Hub.</p></li><li><b>Train and get paid</b><p>Track your booked sessions and earnings.</p></li></ol><Link href="/training">Already a trainer? Open your Trainer Hub</Link></div>
    {done ? <div className="network-message" role="status">{message}</div> : <form className="card application-form" onSubmit={submit}><fieldset><legend>How do you want to work with Aldrich?</legend><div className="seg">{["network", "referral"].map(m => <button type="button" key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>{m === "network" ? "Network trainer" : "Referral partner"}</button>)}</div></fieldset><div className="two"><label className="field">Full name<input name="full_name" autoComplete="name" required maxLength={150} /></label><label className="field">Phone<input name="phone" type="tel" autoComplete="tel" required maxLength={40} /></label></div><label className="field">Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
      <Choices name="sports" label="Sports you’d train" options={[...sports, "Other"]} /><label className="field">Other sport<input name="other_sport" maxLength={120} /></label>
      <Choices name="level" label="Which level fits you best? Aldrich confirms your level after the interview." options={["Rising", "Collegiate", "Elite"]} single />
      <Choices name="playing_levels" label="Levels you’ve played" options={["High school: JV", "High school: Varsity", "Travel team", "Club / academy", "College: JUCO or NAIA", "College: Division III", "College: Division II", "College: Division I", "Semi-pro", "Professional", "Other"]} />
      <label className="field">Teams, schools or programs<input name="background" required maxLength={1000} /></label><Choices name="coaching_experience" label="Coaching experience" options={["None yet", "Youth / rec", "Camps & clinics", "Travel / club", "High school", "College", "Private training"]} />
      <Choices name="locations" label="Where could you train?" options={[...locations, "Private location (I travel to clients)", "Other"]} /><label className="field">Other locations / travel areas<input name="other_location" maxLength={500} /></label><label className="field">When are you usually free?<input name="availability" required maxLength={1000} placeholder="Weekday evenings, Saturday mornings" /></label><label className="field">Coaching experience and why you want to train<textarea name="motivation" required rows={4} maxLength={4000} /></label>
      {mode === "referral" && <><label className="field">Your booking website<input name="booking_url" type="url" placeholder="https://" required maxLength={2000} /></label><label className="field">Business name<input name="business_name" maxLength={150} /></label><label className="field">Discount you’d offer Aldrich families<input name="referral_discount" required maxLength={300} /></label></>}
      <Choices name="insurance" label="Do you have trainer liability insurance?" options={["Yes", "Not yet", "Looking into it"]} single /><p>Recommended, not required.</p><details><summary>Read the waiver, trainer guidelines and code of conduct</summary><div dangerouslySetInnerHTML={{ __html: trainerTerms }} /></details><label className="check"><input name="terms_accepted" type="checkbox" required />I have read and agree to the Aldrich Sports Waiver, Trainer Guidelines and Code of Conduct.</label><button className="btn btn-orange" disabled={busy}>{busy ? "Submitting…" : "Submit application"}</button>{message && <p role="alert">{message}</p>}
    </form>}</div></section>;
}
