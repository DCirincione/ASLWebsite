import Link from "next/link";

import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";

export default function AccountPage() {
  return (
    <PageShell>
      <Section
        id="account-page"
        eyebrow="Account"
        title="Create an account"
        description="Set up your profile to manage teams, rosters, and registrations."
        headingLevel="h1"
      >
        <p>
          Connect this page to your auth flow. For now, link to your registration
          form or onboarding steps.
        </p>
        <div className="hero__actions" style={{ marginTop: 16 }}>
          <Link className="button primary" href="/register">
            Register a Team
          </Link>
          <Link className="button ghost" href="/contact">
            Need help?
          </Link>
        </div>
      </Section>
    </PageShell>
  );
}
