import EventCheckoutPageClient from "./page-client";

export default async function EventCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ draftId?: string }>;
}) {
  const params = await searchParams;
  return <EventCheckoutPageClient draftId={params.draftId ?? null} />;
}
