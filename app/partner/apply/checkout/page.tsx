import PartnerApplicationCheckoutPageClient from "./page-client";

export default async function PartnerApplicationCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ draftId?: string }>;
}) {
  const params = await searchParams;
  return <PartnerApplicationCheckoutPageClient draftId={params.draftId ?? null} />;
}
