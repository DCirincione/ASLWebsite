import Link from "next/link";

import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";

export default function EventsPage() {
  return (
    <PageShell>
      <Section
        id="events-page"
        eyebrow="Events"
        title="Upcoming events"
        description="Tournaments, showcases, and special matchups. Add details, dates, and registration links here."
        headingLevel="h1"
      >
        <p>
          Replace this section with your events feed or embed a calendar. Link to
          registration forms, schedules, and brackets.
        </p>
        <div className="hero__actions" style={{ marginTop: 16 }}>
          <Link className="button primary" href="/register">
            Register a Team
          </Link>
          <Link className="button ghost" href="/contact">
            Ask a question
          </Link>
        </div>
      </Section>
    </PageShell>
  );
}
