import Link from "next/link";

import { FeatureCard } from "@/components/feature-card";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";

const highlights = [
  {
    title: "App router first",
    description:
      "Routing, layouts, and metadata live in app/ so every page follows the same structure.",
    badge: "App directory",
  },
  {
    title: "Reusable components",
    description:
      "A components/ folder is ready for navigation, sections, cards, and anything else you build.",
    badge: "Components",
  },
  {
    title: "TypeScript + ESLint",
    description:
      "Strict types and linting are wired up to keep the project healthy as it grows.",
    badge: "Quality",
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
        className="hero"
        eyebrow="ASL Website"
        title="Next.js starter set up for the app router and shared components"
        description="Use this as the base for the new site. Swap in your copy, drop in new components, and keep everything consistent."
        headingLevel="h1"
      >
        <div className="hero__actions">
          <Link className="button primary" href="#projects">
            Explore sections
          </Link>
          <Link className="button ghost" href="#contact">
            Plan next steps
          </Link>
        </div>
      </Section>

      <Section
        id="projects"
        eyebrow="Building blocks"
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
          <Link className="button primary" href="#projects">
            Start building
          </Link>
        </div>
      </Section>
    </PageShell>
  );
}
