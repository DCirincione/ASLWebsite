import Link from "next/link";

import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";

export default function ContactPage() {
  return (
    <PageShell>
      <Section
        id="contact-page"
        eyebrow="Contact"
        title="Get in touch"
        description="Reach out about leagues, events, sponsorships, or anything else."
        headingLevel="h1"
      >
        <p>
          Drop in your preferred contact form or list a direct email/phone here.
          For now, use the links below to get started.
        </p>
        <div className="hero__actions" style={{ marginTop: 16 }}>
          <Link className="button primary" href="mailto:">
            Email us
          </Link>
          <Link className="button ghost" href="/register">
            Register a Team
          </Link>
        </div>
      </Section>
    </PageShell>
  );
}
