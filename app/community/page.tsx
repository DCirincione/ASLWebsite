import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";

export default function CommunityPage() {
  return (
    <PageShell>
      <Section
        id="community-page"
        eyebrow="Community"
        title="Community hub"
        description="Spotlight teams, volunteers, and partners. Share news, photos, and ways to get involved."
        headingLevel="h1"
      >
        <p>
          Replace this with stories, highlights, and content that keeps families
          connected to the league. Add links to newsletters, social channels, or
          donation drives.
        </p>
      </Section>
    </PageShell>
  );
}
