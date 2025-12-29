import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";

export default function SponsorsPage() {
  return (
    <PageShell>
      <Section
        id="sponsors-page"
        eyebrow="Sponsors"
        title="Our sponsors"
        description="Feature partners, sponsorship packages, and how to support the league."
        headingLevel="h1"
      >
        <p>
          Swap in logos, tiers, and contact info for prospective sponsors. You
          can include a downloadable deck or a form for new sponsorship inquiries.
        </p>
      </Section>
    </PageShell>
  );
}
