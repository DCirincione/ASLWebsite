import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { CSSProperties } from "react";

import { HomeUpcomingEvents } from "@/components/home-upcoming-events";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { resolveHomeBannerButtonHref } from "@/lib/home-banner";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site-metadata";
import { readSiteSettings } from "@/lib/site-settings";

export const metadata: Metadata = {
  title: {
    absolute: SITE_NAME,
  },
  description: SITE_DESCRIPTION,
};

export default async function Home() {
  noStore();

  const siteSettings = await readSiteSettings();
  const homeBannerText = siteSettings.homeBanner.text.trim();
  const homeBannerButtonHref = resolveHomeBannerButtonHref(siteSettings.homeBanner);
  const showHomeBanner = siteSettings.homeBanner.enabled && Boolean(homeBannerText);

  return (
    <PageShell>
      <Section
        id="home"
        className={`hero hero--image hero--full${showHomeBanner ? " hero--with-banner" : ""}`}
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
        {showHomeBanner ? (
          <div className="home-banner home-banner--overlay" aria-label="Home page announcement">
            <div className="home-banner__inner">
              <span className="home-banner__label">Announcement</span>
              <p className="home-banner__message">{homeBannerText}</p>
              {homeBannerButtonHref ? (
                <Link
                  className="button ghost home-banner__button"
                  href={homeBannerButtonHref}
                >
                  Take Me There
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
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
              <Link className="button ghost" href="/sports">
                Browse Sports
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
        <HomeUpcomingEvents />
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
          <div className="why-card why-card--image">
            <Image
              src="/home/joefrancis.jpg"
              alt=""
              fill
              sizes="(max-width: 900px) 100vw, 33vw"
              style={{ objectFit: "cover" }}
            />
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
          <Link className="button primary" href="/events">
            Browse Events
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
