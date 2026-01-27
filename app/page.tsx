import Link from "next/link";
import { CSSProperties } from "react";

import { EventCard } from "@/components/event-card";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { supabase } from "@/lib/supabase/client";

type HomeEvent = {
  title: string;
  date: string;
  location: string;
  href?: string;
  image?: string;
};

const fallbackEvents: HomeEvent[] = [
  {
    title: "3v3 Basketball Tournament",
    date: "March 15, 2024",
    location: "Central Sports Complex",
    image:
      "https://images.unsplash.com/photo-1505666287802-931dc83948e0?auto=format&fit=crop&w=800&q=80",
    href: "/events",
  },
  {
    title: "Pickleball League",
    date: "March 20, 2024",
    location: "Riverside Courts",
    image: "public/Pickleball/boxPB.jpeg",
    href: "/events",
  },
  {
    title: "Flag Football Tournament",
    date: "April 5, 2024",
    location: "Green Field Park",
    image:
      "https://images.unsplash.com/photo-1471295253337-3ceaaedca402?auto=format&fit=crop&w=800&q=80",
    href: "/events",
  },
  {
    title: "Community vs Kids Charity Game",
    date: "April 12, 2024",
    location: "Central Sports Complex",
    image:
      "https://images.unsplash.com/photo-1508609349937-5ec4ae374ebf?auto=format&fit=crop&w=800&q=80",
    href: "/events",
  },
];

const formatDate = (value?: string | null) => {
  if (!value) return "Date TBD";
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return "Date TBD";
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
};

const forever5Images = ["/forever5/newman5.png"];
const pickleballImages = ["/pickleball/boxPB.jpeg", "/PickleTourneyCourt6.png"];
const aldrichJrImages: string[] = [];
const basketballImages: string[] = ["/basketball/champst2025.jpeg"];
const amputeeImages: string[] = ["/amputee/amputee2025.jpeg"];
const sundayLeagueImages: string[] = ["/sundayLeague/champs2025.jpeg"];
const communityVsKidsImages: string[] = ["/commVsKids/cVsK2025.jpeg"];

const fallbackImages = fallbackEvents.map((e) => e.image).filter(Boolean) as string[];

const pickImageForTitle = (title: string, idx: number) => {
  const lower = title.toLowerCase();
  const rules: { keywords: string[]; pool: string[] }[] = [
    {
      keywords: [
        "community vs kids",
        "community vs. kids",
        "community versus kids",
        "community kids",
      ],
      pool: communityVsKidsImages,
    },
    { keywords: ["newman"], pool: forever5Images },
    { keywords: ["pickleball"], pool: pickleballImages },
    { keywords: ["aldrich jr", "jr"], pool: aldrichJrImages },
    { keywords: ["basketball", "hoops"], pool: basketballImages },
    { keywords: ["amputee"], pool: amputeeImages },
    { keywords: ["sunday league"], pool: sundayLeagueImages },
  ];

  for (const rule of rules) {
    if (rule.keywords.some((kw) => lower.includes(kw)) && rule.pool.length > 0) {
      return rule.pool[idx % rule.pool.length];
    }
  }

  if (fallbackImages.length > 0) {
    return fallbackImages[idx % fallbackImages.length];
  }
  return undefined;
};

async function getUpcomingEvents(): Promise<HomeEvent[]> {
  if (!supabase) return fallbackEvents;

  const { data, error } = await supabase
    .from("events")
    .select("title,start_date,location")
    .order("start_date", { ascending: true, nullsFirst: false })
    .limit(4);

  if (error || !data || data.length === 0) return fallbackEvents;

  return data.map((event, idx) => {
    const image = pickImageForTitle(event.title, idx);
    return {
      title: event.title,
      date: formatDate(event.start_date),
      location: event.location ?? "Location TBD",
      href: "/events",
      image,
    };
  });
}

export default async function Home() {
  const upcomingEvents = await getUpcomingEvents();

  return (
    <PageShell>
      <Section
        id="home"
        className="hero hero--image hero--full"
        title="Community Sports. Real Competition. Local Impact."
        description=""
        headingLevel="h1"
        showHeader={false}
        style={
          {
            "--hero-image": "url('/Hero.jpg')",
          } as CSSProperties
        }
      >
        <div className="hero__panel">
          <div className="hero__content">
            <h1 className="hero__title">
              Community Sports. Real Competition. Local Impact.
            </h1>
            <p className="hero__lede">
              ALDRICH SPORTS hosts tournaments, leagues, and charity events for
              all ages. Join the community and be part of something special.
            </p>
            <div className="hero__actions">
              <Link className="button primary" href="#events">
                View Upcoming Events
              </Link>
              <Link className="button ghost" href="#projects">
                Register a Team
              </Link>
            </div>
          </div>
        </div>
        <Link className="hero__arrow" href="#events" aria-label="Scroll to events">
          ↓
        </Link>
      </Section>

      <Section
        id="events"
        eyebrow="Upcoming"
        title="Upcoming Events"
        description="Check out the latest tournaments and leagues happening near you."
      >
        <div className="event-grid">
          {upcomingEvents.map((event, idx) => (
            <EventCard
              key={`${event.title}-${idx}`}
              title={event.title}
              date={event.date}
              location={event.location}
              image={event.image}
              href={event.href}
            />
          ))}
        </div>
        <div className="event-actions">
          <Link className="button primary" href="/events">
            View All Events
          </Link>
        </div>
      </Section>

      <Section
        id="programs"
        eyebrow="What We Do"
        title="What ALDRICH SPORTS Does"
        description="We offer a variety of sports experiences for everyone in the community."
      >
        <div className="program-grid">
          <div className="program-card">
            <div className="program-card__icon" aria-hidden>
              🏆
            </div>
            <h3>Tournaments</h3>
            <p className="muted">
              One-day and multi-week competitive events with prizes.
            </p>
          </div>
          <div className="program-card">
            <div className="program-card__icon" aria-hidden>
              👥
            </div>
            <h3>Sports</h3>
            <p className="muted">Seasonal leagues and pickup for all skill levels.</p>
          </div>
          <div className="program-card">
            <div className="program-card__icon" aria-hidden>
              ❤️
            </div>
            <h3>Community Events</h3>
            <p className="muted">Charity tournaments and local fundraisers.</p>
          </div>
          <div className="program-card">
            <div className="program-card__icon" aria-hidden>
              🎯
            </div>
            <h3>Competitive Play</h3>
            <p className="muted">Real stats, trophies, and awards.</p>
          </div>
        </div>
      </Section>

      <Section
        id="why"
        eyebrow="Why Aldrich Sports?"
        title="Why ALDRICH SPORTS?"
        description="Locally run, organized, and focused on fair competition for every division."
      >
        <div className="why-grid">
          <ul className="why-list">
            <li>
              <span aria-hidden>✔️</span>
              <p>Locally run and community-focused</p>
            </li>
            <li>
              <span aria-hidden>✔️</span>
              <p>Fair competition with clear divisions</p>
            </li>
            <li>
              <span aria-hidden>✔️</span>
              <p>Organized events with real referees</p>
            </li>
            <li>
              <span aria-hidden>✔️</span>
              <p>Supporting local causes and athletes</p>
            </li>
          </ul>
          <div className="why-card">
            <div className="why-card__icon" aria-hidden>
              🏆
            </div>
            <p>Join our community of athletes and sports enthusiasts.</p>
          </div>
        </div>
      </Section>

      <Section
        id="community"
        eyebrow="Join In"
        title="Join Our Community"
        description="See the amazing athletes and teams that make up ALDRICH SPORTS."
      >
        <div className="community-grid">
          <div className="community-media">
            <div className="community-image" role="img" aria-label="Athletes smiling on the court" />
          </div>
          <div className="community-copy">
            <h3>A Thriving Sports Community</h3>
            <p>
              ALDRICH SPORTS brings together athletes of all skill levels, ages, and backgrounds.
              Our events foster friendships, build team spirit, and create lasting memories.
            </p>
            <ul className="why-list">
              <li>
                <span aria-hidden>✔️</span>
                <p>Inclusive and welcoming to all skill levels</p>
              </li>
              <li>
                <span aria-hidden>✔️</span>
                <p>Professional organization and fair competition</p>
              </li>
              <li>
                <span aria-hidden>✔️</span>
                <p>Strong community bonds and local impact</p>
              </li>
            </ul>
          </div>
        </div>
      </Section>

      <Section
        id="cta"
        className="cta-section"
        eyebrow="Ready to play?"
        title="Ready to Play?"
        description="Join thousands of athletes and sports enthusiasts in ALDRICH SPORTS. Whether you want to compete, stay active, or support our community, there's a place for you."
      >
        <div className="cta-actions">
          <Link className="button primary" href="/register">
            Register a Team
          </Link>
          <Link className="button ghost" href="/contact">
            Become a Sponsor
          </Link>
          <Link className="button ghost" href="/contact">
            Contact Us
          </Link>
        </div>
      </Section>
    </PageShell>
  );
}
