import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";

import { MerchStorefront } from "@/components/merch-storefront";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { readMerchCatalog } from "@/lib/printful";

export const metadata: Metadata = {
  title: "Merch",
  description: "Shop Aldrich Sports merchandise, apparel, and fan gear.",
};

export default async function MerchPage() {
  noStore();

  const catalog = await readMerchCatalog();

  return (
    <PageShell>
      <Section id="merch-page" className="merch-section" title="Merchandise" headingLevel="h1" showHeader={false}>
        <MerchStorefront catalog={catalog} />
      </Section>
    </PageShell>
  );
}
