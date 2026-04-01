import { unstable_noStore as noStore } from "next/cache";

import { readSundayLeagueSignupForm } from "@/lib/sunday-league-signup-form-store";

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
  noStore();
  const params = await searchParams;
  const signupForm = await readSundayLeagueSignupForm();

  return <SundayLeaguePageClient initialSection={normalizeSection(params.section)} signupForm={signupForm} />;
}
