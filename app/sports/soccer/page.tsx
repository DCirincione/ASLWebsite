"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { supabase } from "@/lib/supabase/client";
import type { Soccer } from "@/lib/supabase/types";
import { SoccerTournaments } from "./tournaments";

type SoccerCard = Soccer & { image?: string };

const fallbackItems: SoccerCard[] = [
  {
    id: "clinic-1",
    title: "Finishing & First Touch Clinic",
    type: "clinic",
    start_date: "2026-02-15",
    time_info: "Sunday 2:00 PM",
    location: "Newman Field 5",
    description: "Small-group reps on striking, first touch, and decision making.",
    cta_label: "Save your spot",
    cta_url: "/events",
    level: "All levels",
    image: "/forever5/newman5.png",
  },
  {
    id: "league-1",
    title: "Spring 7v7 League",
    type: "league",
    start_date: "2026-03-10",
    time_info: "Tuesday nights",
    location: "Aldrich",
    description: "8-week season with playoffs. Rosters up to 12.",
    cta_label: "Register team",
    cta_url: "/register",
    level: "Competitive / Coed",
    image: "/forever5/newman5.png",
  },
  {
    id: "pickup-1",
    title: "Saturday Pickup",
    type: "pickup",
    start_date: null,
    time_info: "10:00 AM",
    location: "Newman Field 5",
    description: "Open play, rotating teams, all levels welcome.",
    cta_label: "RSVP",
    cta_url: "/events",
    level: "Open",
    image: "/forever5/newman5.png",
  },
];

const imageFallbacks = ["/forever5/newman5.png", "/basketball/champst2025.jpeg", "/PickleTourneyCourt6.png"];

export default function SoccerPage() {
  const [items, setItems] = useState<SoccerCard[]>(fallbackItems);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!supabase) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("soccer")
        .select("id,title,type,start_date,end_date,time_info,location,description,cta_label,cta_url,image_url,level")
        .order("start_date", { ascending: true, nullsFirst: false });
      if (!error && data) {
        const mapped = (data as Soccer[]).map((row, idx) => ({
          ...row,
          image: row.image_url || imageFallbacks[idx % imageFallbacks.length],
        }));
        setItems(mapped);
      }
      setLoading(false);
    };
    load();
  }, []);

  const byType = useMemo(() => {
    const clinics = items.filter((i) => i.type === "clinic");
    const leagues = items.filter((i) => i.type === "league");
    const pickup = items.filter((i) => i.type === "pickup");
    return { clinics, leagues, pickup };
  }, [items]);

  const renderCards = (list: SoccerCard[]) => {
    if (!list || list.length === 0) {
      return <p className="muted">No items posted yet.</p>;
    }
    return (
      <div className="list list--grid">
        {list.map((item, idx) => (
          <article key={item.id ?? idx} className="soccer-card">
            <div className="soccer-card__media">
              <img src={item.image || imageFallbacks[idx % imageFallbacks.length]} alt="" />
            </div>
            <div className="soccer-card__body">
              <p className="list__title">{item.title}</p>
              <p className="muted">
                {[item.time_info, item.location, item.level].filter(Boolean).join(" • ")}
              </p>
              <p className="muted">{item.description}</p>
              <div className="cta-row">
                {item.cta_url ? (
                  <Link className="button primary" href={item.cta_url}>
                    {item.cta_label ?? "Details"}
                  </Link>
                ) : null}
                <Link className="button ghost" href="/community">
                  Find teammates
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  };

  return (
    <PageShell>
      <Section
        id="soccer-hero"
        eyebrow="Soccer"
        title="Play Soccer with Aldrich"
        description="Leagues, pickup, and tournaments for every level. Form a team or jump into weekly runs."
        headingLevel="h1"
        className="soccer-hero"
      >
        <div className="soccer-hero__grid">
          <div className="soccer-hero__copy">
            <div className="cta-row">
              <Link className="button primary" href="#join">
                Join a league
              </Link>
              <Link className="button ghost" href="#pickup">
                Find pickup
              </Link>
              <Link className="button ghost" href="#tournaments">
                Tournaments
              </Link>
            </div>
          </div>
          <div className="soccer-hero__logo">
            <Image
              src="/sports_images/soccer/soccerLogoTest.png"
              alt="Aldrich Soccer"
              fill
              priority
            />
          </div>
        </div>
      </Section>

      <Section
        id="clinics"
        eyebrow="Clinics"
        title="Skill Clinics"
        description="Targeted, small-sided sessions led by Aldrich coaches."
        headingLevel="h2"
        className="soccer-section"
      >
        {loading ? <p className="muted">Loading clinics...</p> : renderCards(byType.clinics)}
      </Section>

      <Section
        id="join"
        eyebrow="Leagues"
        title="League Play"
        description="Pick your format and night. Captains can register teams or add free agents."
        headingLevel="h2"
        className="soccer-section"
      >
        {loading ? <p className="muted">Loading leagues...</p> : renderCards(byType.leagues)}
      </Section>

      <Section
        id="pickup"
        eyebrow="Pickup"
        title="Pickup Sessions"
        description="Weekly runs with a host, pinnies, and rotating teams."
        headingLevel="h2"
        className="soccer-section"
      >
        {loading ? <p className="muted">Loading pickup...</p> : renderCards(byType.pickup)}
      </Section>

      <Section
        id="tournaments"
        eyebrow="Cups"
        title="Tournaments"
        description="Weekend cups and seasonal brackets."
        headingLevel="h2"
        className="soccer-section"
      >
        <SoccerTournaments />
      </Section>
    </PageShell>
  );
}
