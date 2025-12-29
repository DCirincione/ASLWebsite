import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";

export default function LeaguesPage() {
  return (
    <PageShell>
      <Section
        id="leagues-page"
        eyebrow="Leagues"
        title="League info"
        description="Standings, divisions, and schedules. Use this page to keep every team on the same page."
        headingLevel="h1"
      >
        <p>
          Add tables or embeds for standings, post game recaps, and keep FAQs for
          coaches and players handy. You can link to rules, waivers, and score
          submission forms from here.
        </p>
      </Section>
    </PageShell>
  );
}
