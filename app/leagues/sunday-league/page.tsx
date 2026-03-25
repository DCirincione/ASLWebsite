import SundayLeaguePageClient from "./page-client";

type SundayLeagueSection = "overview" | "rules" | "teams" | "leaderboards" | "schedule" | "inquiries";

const normalizeSection = (value?: string): SundayLeagueSection => {
  if (
    value === "overview" ||
    value === "rules" ||
    value === "teams" ||
    value === "leaderboards" ||
    value === "schedule" ||
    value === "inquiries"
  ) {
    return value;
  }

  return "overview";
};

export default async function SundayLeaguePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const params = await searchParams;
  return <SundayLeaguePageClient initialSection={normalizeSection(params.section)} />;
}
