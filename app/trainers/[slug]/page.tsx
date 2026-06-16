import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublicTrainerBySlug, getPublicTrainers } from "@/lib/trainers";

import TrainerPageClient from "./page-client";

import "./trainer.css";

type TrainerPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export const generateStaticParams = async () => (await getPublicTrainers()).map((trainer) => ({ slug: trainer.slug }));

export async function generateMetadata({ params }: TrainerPageProps): Promise<Metadata> {
  const { slug } = await params;
  const trainer = await getPublicTrainerBySlug(slug);

  if (!trainer) {
    return {
      title: "Trainer Not Found",
    };
  }

  return {
    title: `${trainer.name} Training`,
    description: trainer.headline,
  };
}

export default async function TrainerPage({ params }: TrainerPageProps) {
  const { slug } = await params;
  const trainer = await getPublicTrainerBySlug(slug);

  if (!trainer) {
    notFound();
  }

  return <TrainerPageClient trainer={trainer} />;
}
