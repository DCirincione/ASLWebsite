import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";

import "./merch.css";

import { MerchStorefront } from "@/components/merch-storefront";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { readMerchCatalog } from "@/lib/printful";
import { readSiteSettings } from "@/lib/site-settings";

export const metadata: Metadata = {
  title: "Merch",
  description: "Shop Aldrich Sports merchandise, apparel, and fan gear.",
};

export default async function MerchPage() {
  noStore();

  const [catalog, siteSettings] = await Promise.all([readMerchCatalog(), readSiteSettings()]);

  return (
    <PageShell>
      <Section id="merch-page" className="merch-section" title="Merchandise" headingLevel="h1" showHeader={false}>
        <div className="merch-fund-banner" aria-label="Aldrich Sports Fund announcement">
          <div className="merch-fund-banner__inner">
            <span className="merch-fund-banner__label">Aldrich Sports Fund</span>
            <p className="merch-fund-banner__message">
              For every piece of clothing sold, we put $1 to the Aldrich Sports Fund
            </p>
            <Link className="button ghost merch-fund-banner__button" href="/community">
              Learn More
            </Link>
          </div>
        </div>
        <MerchStorefront catalog={catalog} purchasesEnabled={siteSettings.merch.purchasesEnabled} />
      </Section>
    </PageShell>
  );
}
