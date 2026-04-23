import "../sunday-league.css";
import SundayLeagueDepositPageClient from "./page-client";
import { readSundayLeagueSettings } from "@/lib/sunday-league-settings";

export default async function SundayLeagueDepositPage({
  searchParams,
}: {
  searchParams: Promise<{ teamId?: string; draftId?: string }>;
}) {
  const params = await searchParams;
  const sundayLeagueSettings = await readSundayLeagueSettings();
  return (
    <SundayLeagueDepositPageClient
      teamId={params.teamId ?? null}
      draftId={params.draftId ?? null}
      depositAmountCents={sundayLeagueSettings.depositAmountCents}
    />
  );
}
