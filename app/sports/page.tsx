"use client";

import { useEffect, useMemo, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { supabase } from "@/lib/supabase/client";
import type { Sport } from "@/lib/supabase/types";

type SportCard = Sport & { image?: string; activities?: string };

const fallbackSports: SportCard[] = [
  { id: "baseball", title: "Baseball", players_per_team: 9, gender: "open", short_description: "Diamond leagues, tourneys, and skills." },
  { id: "basketball", title: "Basketball", players_per_team: 5, gender: "open", short_description: "5v5 leagues, 3v3 nights, clinics." },
  { id: "esports", title: "Esports", players_per_team: null, gender: "open", short_description: "Seasonal ladders and LAN nights." },
  { id: "flag-football", title: "Flag Football", players_per_team: 7, gender: "coed", short_description: "Non-contact leagues and tourneys." },
  { id: "golf", title: "Golf", players_per_team: 4, gender: "open", short_description: "Scrambles, outings, and skins." },
  { id: "mini-golf", title: "Mini-Golf", players_per_team: 4, gender: "open", short_description: "Casual putt-putt meetups." },
  { id: "pickleball", title: "Pickleball", players_per_team: 2, gender: "coed", short_description: "Leagues, ladders, and tournaments." },
  { id: "run-club", title: "Run Club", players_per_team: 1, gender: "open", short_description: "Group runs and race prep." },
  { id: "soccer", title: "Soccer", players_per_team: 11, gender: "open", short_description: "Leagues, pickup, and cups." },
  { id: "youth-soccer", title: "Youth Soccer", players_per_team: 7, gender: "coed", short_description: "Small-sided youth play." },
];

const sportImages: Record<string, string> = {
  baseball: "/baseball/champst2025.jpeg",
  basketball: "/basketball/champst2025.jpeg",
  esports: "/esports/esports.jpg",
  "flag-football": "/football/flag.jpg",
  golf: "/golf/golf.jpg",
  "mini-golf": "/golf/minigolf.jpg",
  pickleball: "/PickleTourneyCourt6.png",
  "run-club": "/run/runclub.jpg",
  soccer: "/forever5/newman5.png",
  "youth-soccer": "/forever5/newman5.png",
};

const activityLabels: Record<string, string> = {
  baseball: "Leagues • Tournaments",
  basketball: "Leagues • 3v3 • Clinics",
  esports: "Ladders • LAN • Tournaments",
  "flag-football": "Leagues • Pickup • Tournaments",
  golf: "Scrambles • Outings",
  "mini-golf": "Meetups",
  pickleball: "Leagues • Tournaments",
  "run-club": "Group Runs • Races",
  soccer: "Leagues • Pickup • Tournaments",
  "youth-soccer": "Leagues • Clinics",
};

export default function SportsPage() {
  const [sports, setSports] = useState<SportCard[]>(fallbackSports);
  const [selected, setSelected] = useState<string>("all");

  useEffect(() => {
    const loadSports = async () => {
      if (!supabase) return;
      const { data, error } = await supabase.from("sports").select("*").order("title", { ascending: true });
      if (!error && data) {
        const mapped = (data as Sport[]).map((sport) => {
          const id = sport.id ?? sport.title.toLowerCase().replace(/\s+/g, "-");
          return {
            ...sport,
            id,
            image: sportImages[id] || sportImages[sport.title.toLowerCase().replace(/\s+/g, "-")] || undefined,
          };
        });
        setSports(mapped);
      }
    };
    loadSports();
  }, []);

  const filtered = useMemo(() => {
    if (selected === "all") return sports;
    return sports.filter((s) => s.id === selected || s.title.toLowerCase().replace(/\s+/g, "-") === selected);
  }, [selected, sports]);

  const handleJump = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const options = [
    { value: "all", label: "All Sports" },
    ...sports.map((s) => ({
      value: s.id,
      label: s.title,
    })),
  ];

  return (
    <PageShell>
      <Section
        id="sports-page"
        eyebrow="Sports"
        title="All Sports"
        description="Pick your sport to see leagues, pickup, and tournaments."
        headingLevel="h1"
        className="sports-section"
      >
        <div className="sports-filter">
          <label className="sr-only" htmlFor="sports-select">
            Filter sports
          </label>
          <select
            id="sports-select"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sports-stack">
          {filtered.map((sport, idx) => {
            const id = sport.id ?? sport.title.toLowerCase().replace(/\s+/g, "-");
            const activities =
              sport.short_description ||
              activityLabels[id] ||
              activityLabels[sport.title.toLowerCase().replace(/\s+/g, "-")] ||
              "Leagues • Pickup • Tournaments";
            const bgImage = sport.image || sportImages[id];
            const tone = idx % 2 === 0 ? "sport-card--primary" : "sport-card--secondary";
            return (
              <article
                key={id}
                id={id}
                className={`sport-card ${tone}`}
                style={
                  {
                    "--sport-bg": bgImage ? `url(${bgImage})` : "none",
                  } as React.CSSProperties
                }
              >
                <div className="sport-card__overlay">
                  <div className="sport-card__content">
                    <button className="sport-card__cta" type="button">
                      Play {sport.title}
                    </button>
                    <p className="sport-card__meta">{activities}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </Section>
    </PageShell>
  );
}
