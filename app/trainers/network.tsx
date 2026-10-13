"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase/client";
import { canAccessTrainerPortal } from "@/lib/event-approval";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AccessibilityControls } from "@/components/accessibility-controls";
import type { TrainerProfile } from "@/lib/trainers";
import { joinMarketing } from "./marketing";
import Calculator from "./calculator";
import TrainerApplication from "./trainer-application";
import BookingDrawer from "./booking-drawer";

const TrainerPortal = dynamic(() => import("../training/trainer-portal"), { loading: () => <p role="status">Loading trainer portal…</p> });

const unique = (items: string[]) => [...new Set(items.map(s => s.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
export const trainerSports = (t: TrainerProfile) => t.network.sports?.length ? t.network.sports : [t.sport].filter(Boolean);
export const trainerLocations = (t: TrainerProfile) => t.network.locations?.length ? t.network.locations : [t.location].filter(Boolean);
export const tierClass = (level?: string | null) => level === "Rising" ? "b-rising" : level === "Collegiate" ? "b-coll" : level === "Elite" ? "b-elite" : "b-partner";
export const sessionPrice = (t: TrainerProfile) => t.sessionTypes.flatMap(s => {
  const n = s.priceCents ?? Number(s.price.replace(/[$,]/g, "")) * 100;
  return Number.isFinite(n) && n > 0 ? [n] : [];
});
export function TrainerCard({ trainer: t, onBook }: { trainer: TrainerProfile; onBook: () => void }) {
  const n = t.network, partner = n.booking_mode === "referral", prices = sessionPrice(t);
  return <article className={`tcard${partner ? " partner" : ""}`}><div className="thead"><div className="avatar" style={{ background: "var(--orange-soft)", color: "var(--orange-ink)", overflow: "hidden" }}>{t.headshotUrl !== "/ASLLogo.png" ? <Image unoptimized width={56} height={56} src={t.headshotUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : t.name.split(/\s+/).map(p => p[0]).slice(0, 2).join("")}</div><div><div className="tname"><Link href={`/trainers/${t.slug}`}>{t.name}</Link></div><div className="tsport">{trainerSports(t).join(" · ")} trainer</div>{(partner || n.level) && <span className={`badge ${partner ? "b-partner" : tierClass(n.level)}`}>{partner ? "Referral partner" : n.level}</span>}</div></div>
    {n.interview_quote && <blockquote className="quote">“{n.interview_quote}”<small>From their interview with Aldrich</small></blockquote>}
    {(n.background || t.headline) && <p><b>Background:</b> {n.background || t.headline}</p>}
    <div className="strengths">{t.specialties.map(s => <span key={s}>{s}</span>)}</div><div className="venues">⌖ {trainerLocations(t).join(" · ") || "Location to be confirmed"}</div>
    {n.travel_areas && <div className="travel">Travels to you: {n.travel_areas}{n.travel_miles ? ` (up to ${n.travel_miles} mi)` : ""}</div>}
    {partner && n.referral_code && <div className="code-row"><div><div className="lbl2">{n.referral_discount || "Aldrich referral code"}</div><span className="code">{n.referral_code}</span></div><CopyCode code={n.referral_code} /></div>}
    <div className="price-row"><div>{partner ? <span className="partner-note">↗ Books on their own site</span> : prices.length ? <><b>${Math.min(...prices) / 100}</b><span> / session</span></> : <span>Rates coming soon</span>}</div><button type="button" className="btn btn-orange" onClick={onBook}>{partner ? "Book with partner" : "See open times"}</button></div>
  </article>;
}
function CopyCode({ code }: { code: string }) {
  const [message, setMessage] = useState("Copy");
  return <button type="button" className="btn btn-ghost" onClick={async () => { try { await navigator.clipboard.writeText(code); setMessage("Copied"); } catch { setMessage("Select code to copy"); } }}>{message}</button>;
}
export default function TrainersNetwork({ trainers, sports, initialTrainer }: { trainers: TrainerProfile[]; sports: string[]; initialTrainer?: TrainerProfile }) {
  const [tab, setTab] = useState("find"), [sport, setSport] = useState(""), [level, setLevel] = useState(""), [location, setLocation] = useState("");
  const [selected, setSelected] = useState<TrainerProfile | null>(initialTrainer ?? null);
  const [hasPortalAccess, setHasPortalAccess] = useState(false);
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    let revision = 0;
    const updateRole = async (userId?: string) => {
      const current = ++revision;
      if (!userId) { if (active) setHasPortalAccess(false); return; }
      const { data, error } = await client.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (active && current === revision) setHasPortalAccess(!error && canAccessTrainerPortal(data?.role));
    };
    const initialRevision = revision;
    void client.auth.getSession().then(({ data }) => { if (active && revision === initialRevision) void updateRole(data.session?.user.id); });
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => { void updateRole(session?.user.id); });
    return () => { active = false; revision++; listener.subscription.unsubscribe(); };
  }, []);
  const activeTab = tab === "portal" && !hasPortalAccess ? "find" : tab;
  const selectTab = (nextTab: string) => {
    flushSync(() => setTab(nextTab));
    const targetId = nextTab === "find" ? "trainer-directory" : nextTab === "join" ? "become-trainer" : "trainer-portal";
    document.getElementById(targetId)?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  };
  const availableSports = unique(trainers.flatMap(trainerSports));
  const levels = unique(trainers.flatMap(t => t.network.booking_mode === "referral" ? ["Partner programs"] : t.network.level ? [t.network.level] : []));
  const locations = unique(trainers.flatMap(trainerLocations));
  const filtered = trainers.filter(t => (!sport || trainerSports(t).includes(sport)) && (!location || trainerLocations(t).includes(location)) && (!level || (level === "Partner programs" ? t.network.booking_mode === "referral" : t.network.level === level && t.network.booking_mode !== "referral")));
  const prices = trainers.filter(t => t.network.booking_mode !== "referral").flatMap(sessionPrice);
  return <><AccessibilityControls /><SiteHeader /><main className="training-network"><div className="hero"><div className="wrap"><div className="hero-grid"><div><div className="eyebrow">Aldrich Training Network</div><h1>Train with athletes<br /><span>who’ve played</span><br />the game</h1><p className="lede">Private and small-group sessions with local high school, college and pro-level athletes. Find your trainer and your next open time.</p></div><div><div className="hero-stats"><div><b>{availableSports.length}</b><span>sports available</span></div><div><b>{trainers.length}</b><span>approved trainers</span></div><div><b>{prices.length ? `$${Math.min(...prices) / 100}` : "—"}</b><span>sessions start at</span></div></div><a className="btn btn-orange" href="#trainer-directory" onClick={() => flushSync(() => setTab("find"))}>Browse trainers</a></div></div><div className="tabs">{["find", "join", ...(hasPortalAccess ? ["portal"] : [])].map(t => <button key={t} className="tab" aria-pressed={activeTab === t} onClick={() => selectTab(t)}>{t === "find" ? "Find a Trainer" : t === "join" ? "Become a Trainer" : "Trainer Portal"}<small>{t === "find" ? "For athletes & parents" : t === "join" ? "Free to join" : "Manage your training"}</small></button>)}</div></div></div>
    {activeTab === "portal" ? <div id="trainer-portal" className="wrap trainer-portal-container"><TrainerPortal embedded /></div> : activeTab === "find" ? <><section id="trainer-directory"><div className="wrap"><div className="sec-head"><div><div className="eyebrow">Find a trainer</div><h2>Pick your sport, pick your fit</h2></div><p>Every trainer is interviewed by Joe or Francis before their profile goes live.</p></div><div className="filters">{[{ label: "Sport", options: availableSports, value: sport, set: setSport }, { label: "Level", options: levels, value: level, set: setLevel }].map(f => <div className="frow" key={f.label}><span className="lbl">{f.label}</span>{["", ...f.options].map(o => <button key={o} className="chip" aria-pressed={f.value === o} onClick={() => f.set(o)}>{o || "All"}</button>)}</div>)}<div className="frow"><label htmlFor="trainer-location">Location</label><select className="select" id="trainer-location" value={location} onChange={e => setLocation(e.target.value)}><option value="">Any location</option>{locations.map(l => <option key={l}>{l}</option>)}</select></div></div>
    <div className="tier-guide">{[["Rising", "High school players and newer trainers. A great fit for beginners and younger kids.", "$30–$45"], ["Collegiate", "Current and former college players. For developing players who want to sharpen up.", "$45–$75"], ["Elite", "Pro, semi-pro and top-level backgrounds. For athletes chasing a roster spot or scholarship.", "$75–$120+"]].map(([name, desc, price]) => <div className="tg" key={name}><span className={`badge ${tierClass(name)}`}>{name}</span><span className="who">{desc}</span><span className="rate">{price} / session</span></div>)}</div><p className="sample-note">Partner trainers book on their own site. Use their Aldrich code where available.</p><div className="grid">{filtered.map(t => <TrainerCard key={t.id} trainer={t} onBook={() => setSelected(t)} />)}{!filtered.length && <div className="network-message filter-empty">{trainers.length ? "No trainers match these filters." : "Trainer profiles are coming soon. Check back as trainers are approved."}{trainers.length > 0 && <button className="btn btn-ghost" onClick={() => { setSport(""); setLevel(""); setLocation(""); }}>Clear filters</button>}</div>}</div></div></section><section className="alt"><div className="wrap"><div className="sec-head"><div><div className="eyebrow">How booking works</div><h2>Book in three steps</h2></div></div><ol className="steps"><li><b>Choose a trainer and time</b><p>Filter by sport, level and location, then pick an open slot.</p></li><li><b>Tell us who’s training</b><p>Book for yourself, your child or another adult. Add the athlete’s details and your contact information.</p></li><li><b>Pay upfront and show up</b><p>Pay online when you book. Any venue fee is shown before checkout.</p></li></ol></div></section></> : <><div id="become-trainer" dangerouslySetInnerHTML={{ __html: joinMarketing }} /><Calculator /><section className="alt"><div className="wrap"><div className="sec-head"><div><div className="eyebrow">Growing with Aldrich</div><h2>From sessions to your own clinic</h2></div></div><ol className="ladder"><li><h3>Private sessions</h3><p>Start with a schedule that works for you.</p><span className="cut">You keep 85%</span></li><li><h3>Busy-trainer rate</h3><p>20 paid sessions in a rolling 60 days unlock the reduced fee.</p><span className="cut">You keep 88%</span></li><li><h3>Camps & clinics</h3><p>Work with Aldrich to plan your next camp or clinic.</p><span className="cut">Discuss a program with us</span></li></ol></div></section><TrainerApplication sports={sports} locations={locations} /></>}
    {selected && <BookingDrawer trainer={selected} onClose={() => setSelected(null)} />}
  </main><SiteFooter /></>;
}
