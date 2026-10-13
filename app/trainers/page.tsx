import type { Metadata } from "next";
import { getPublicTrainers } from "@/lib/trainers";
import { getSupabaseServer } from "@/lib/admin-route-auth";
import TrainersNetwork from "./network";
import "./network.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Aldrich Training Network", description: "Find local sports trainers or apply to train with Aldrich Sports." };

export default async function TrainersPage() {
  const client = getSupabaseServer();
  const [trainers, sports] = await Promise.all([
    getPublicTrainers(),
    client?.from("sports").select("title").order("title"),
  ]);
  return <TrainersNetwork trainers={trainers} sports={(sports?.data ?? []).map((sport: { title: string }) => sport.title)} />;
}
