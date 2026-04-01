import SundayLeagueDepositPageClient from "./page-client";

export default async function SundayLeagueDepositPage({
  searchParams,
}: {
  searchParams: Promise<{ teamId?: string; draftId?: string }>;
}) {
  const params = await searchParams;
  return <SundayLeagueDepositPageClient teamId={params.teamId ?? null} draftId={params.draftId ?? null} />;
}
