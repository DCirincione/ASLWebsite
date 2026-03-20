"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { normalizeSportSlug, slugifySportValue } from "@/lib/sports";
import { supabase } from "@/lib/supabase/client";
import type { Sport } from "@/lib/supabase/types";

type SportCard = Sport & { slug: string };

const sportRouteBySlug: Record<string, string> = {
  baseball: "baseball",
  "baseball-softball": "baseball",
  basketball: "basketball",
  "flag-football": "flag-football",
  golf: "golf",
  "mini-golf": "mini-golf",
  pickleball: "pickleball",
  "run-club": "run-club",
  soccer: "soccer",
  "youth-soccer": "youth-soccer",
};

const fallbackSports: SportCard[] = [
  { id: "baseball", slug: "baseball", title: "Baseball", players_per_team: 9, gender: "open", short_description: "Diamond leagues, tourneys, and skills.", image_url: "/baseball/champst2025.jpeg" },
  { id: "basketball", slug: "basketball", title: "Basketball", players_per_team: 5, gender: "open", short_description: "5v5 leagues, 3v3 nights, clinics.", image_url: "/basketball/champst2025.jpeg" },
  { id: "flag-football", slug: "flag-football", title: "Flag Football", players_per_team: 7, gender: "coed", short_description: "Non-contact leagues and tourneys.", image_url: "/football/flag.jpg" },
  { id: "golf", slug: "golf", title: "Golf", players_per_team: 4, gender: "open", short_description: "Scrambles, outings, and skins.", image_url: "/golf/golf.jpg" },
  { id: "mini-golf", slug: "mini-golf", title: "Mini-Golf", players_per_team: 4, gender: "open", short_description: "Casual putt-putt meetups.", image_url: "/golf/minigolf.jpg" },
  { id: "pickleball", slug: "pickleball", title: "Pickleball", players_per_team: 2, gender: "coed", short_description: "Leagues, ladders, and tournaments.", image_url: "/PickleTourneyCourt6.png" },
  { id: "run-club", slug: "run-club", title: "Run Club", players_per_team: 1, gender: "open", short_description: "Group runs and race prep.", image_url: "/run/runclub.jpg" },
  { id: "soccer", slug: "soccer", title: "Soccer", players_per_team: 11, gender: "open", short_description: "Leagues, pickup, and cups.", image_url: "/forever5/newman5.png" },
  { id: "youth-soccer", slug: "youth-soccer", title: "Youth Soccer", players_per_team: 7, gender: "coed", short_description: "Small-sided youth play.", image_url: "/forever5/newman5.png" },
];

const fallbackSportImages: Record<string, string> = {
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

const getSportImageUrl = (sport: Pick<SportCard, "image_url" | "slug" | "title">) =>
  sport.image_url || fallbackSportImages[sport.slug] || fallbackSportImages[slugifySportValue(sport.title ?? "")] || undefined;

export default function SportsPage() {
  const [sports, setSports] = useState<SportCard[]>(fallbackSports);
  const [selected, setSelected] = useState<string>("all");

  useEffect(() => {
    const loadSports = async () => {
      if (!supabase) return;
      const { data, error } = await supabase.from("sports").select("*").order("title", { ascending: true });
      if (!error && data) {
        const mapped = (data as Sport[]).map((sport) => ({
          ...sport,
          slug: normalizeSportSlug(sport) || slugifySportValue(sport.title ?? "sport"),
        }));
        setSports(mapped);
      }
    };
    void loadSports();
  }, []);

  const scrollToSport = (value: string) => {
    const scrollToIdWithOffset = (id: string) => {
      const target = document.getElementById(id);
      if (!target) return;
      const top = target.getBoundingClientRect().top + window.scrollY - 200;
      window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
    };

    if (value === "all") {
      scrollToIdWithOffset("sports-page");
      return;
    }
    scrollToIdWithOffset(value);
  };

  const options = [
    { value: "all", label: "All Sports" },
    ...sports.map((sport) => ({
      value: sport.slug,
      label: sport.title,
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
            onChange={(e) => {
              const value = e.target.value;
              setSelected(value);
              scrollToSport(value);
            }}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sports-stack">
          {sports.map((sport, idx) => {
            const activities = sport.short_description || activityLabels[sport.slug] || "Leagues • Pickup • Tournaments";
            const bgImage = getSportImageUrl(sport);
            const tone = idx % 2 === 0 ? "sport-card--primary" : "sport-card--secondary";
            const sportRoute = sportRouteBySlug[sport.slug] ?? sport.slug;
            return (
              <article
                key={sport.id}
                id={sport.slug}
                className={`sport-card ${tone}`}
                style={
                  {
                    "--sport-bg": bgImage ? `url(${bgImage})` : "none",
                  } as React.CSSProperties
                }
              >
                <div className="sport-card__overlay">
                  <div className="sport-card__content">
                    <Link className="sport-card__cta" href={`/sports/${sportRoute}`}>
                      Play {sport.title}
                    </Link>
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
