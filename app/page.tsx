import Link from "next/link";
import { CSSProperties } from "react";

import { FeatureCard } from "@/components/feature-card";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";

const highlights = [
  {
    title: "Community-wide leagues",
    description:
      "Organize divisions, standings, and schedules in one place so every team knows what’s next.",
    badge: "Leagues",
  },
  {
    title: "Events that feel big",
    description:
      "Announce tournaments with hero imagery, clear CTAs, and the details parents and players need.",
    badge: "Events",
  },
  {
    title: "Built for updates",
    description:
      "Swap background photos, update copy, and publish new calls-to-action without changing the layout.",
    badge: "Flexible",
  },
];

const roadmap = [
  {
    title: "Add new routes",
    description:
      "Drop new pages into app/ (for example app/about/page.tsx) and reuse sections to keep layouts consistent.",
  },
  {
    title: "Shape the design system",
    description:
      "Grow components/ with buttons, cards, and layouts you can pull into any page.",
  },
  {
    title: "Ship confidently",
    description:
      "Run npm run lint and npm run build before you deploy so everything is production-ready.",
  },
];

export default function Home() {
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
            "--hero-image": "url('/hero.jpg')",
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
              <Link className="button primary" href="#projects">
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
        title="Upcoming events"
        description="Drop your next tournament or league here with dates and registration details."
      >
        <div className="feature-grid">
          <FeatureCard
            title="Spring Tournament"
            description="Double-elimination play across age groups. Registration closes March 1."
            badge="March"
            href="#"
            actionLabel="View schedule"
          />
          <FeatureCard
            title="Summer League"
            description="12-week league with standings, stats, and weekly highlights."
            badge="June"
            href="#"
            actionLabel="Join a team"
          />
          <FeatureCard
            title="Charity 5K"
            description="Run, walk, or cheer—proceeds support youth sports scholarships."
            badge="August"
            href="#"
            actionLabel="Register now"
          />
        </div>
      </Section>

      <Section
        id="projects"
        eyebrow="What’s inside"
        title="Reusable pieces to start shaping pages"
        description="Use these as placeholders for the first drafts of the site and replace them with real content and assets."
      >
        <div className="feature-grid">
          {highlights.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </Section>

      <Section
        id="contact"
        eyebrow="Next steps"
        title="Checklist for the first iteration"
        description="Focus on these tasks to get the first version live."
      >
        <div className="feature-grid">
          {roadmap.map((item) => (
            <FeatureCard key={item.title} {...item} />
          ))}
        </div>
        <div className="callout">
          <p>
            Keep iterating in <code>app/</code> and extend the{" "}
            <code>components/</code> folder as you add pages.
          </p>
          <Link className="button primary" href="#events">
            Start building
          </Link>
        </div>
      </Section>
    </PageShell>
  );
}
