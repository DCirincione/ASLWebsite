import Link from "next/link";

import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";

export default function MerchCheckoutSuccessPage() {
  return (
    <PageShell>
      <Section
        id="merch-checkout-success"
        className="section"
        title="Merch Checkout Started"
        headingLevel="h1"
      >
        <div className="page-card">
          <h2>Thanks for your order.</h2>
          <p>
            Your merch checkout was completed through Square. You should receive confirmation from Square, and the order
            should move into your synced Printful flow from there.
          </p>
          <p>
            <Link className="button primary" href="/merch">
              Back To Merch
            </Link>
          </p>
        </div>
      </Section>
    </PageShell>
  );
}
