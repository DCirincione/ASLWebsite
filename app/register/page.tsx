import Link from "next/link";

import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";

export default function RegisterPage() {
  return (
    <PageShell>
      <Section
        id="register-page"
        eyebrow="Register"
        title="Register a team"
        description="Sign up your team for leagues and events. Add your form or link to your registration system here."
        headingLevel="h1"
      >
        <p>
          Swap this placeholder with your registration flow. Include deadlines,
          fees, and any documents teams need to submit.
        </p>
        <div className="hero__actions" style={{ marginTop: 16 }}>
          <Link className="button ghost" href="/contact">
            Have questions?
          </Link>
        </div>
      </Section>
    </PageShell>
  );
}
