import "server-only";

import { promises as fs } from "fs";
import path from "path";

import { getSupabaseServiceRole } from "@/lib/admin-route-auth";

export type CommunitySponsorPlacement = "standard" | "top";

export type CommunitySponsor = {
  id: string;
  name: string;
  description: string;
  image: string;
  placement: CommunitySponsorPlacement;
  websiteUrl?: string;
  instagramUrl?: string;
};

const COMMUNITY_SPONSORS_SETTINGS_KEY = "community_sponsors";
const sponsorsFilePath = path.join(process.cwd(), "data", "community-sponsors.json");

const normalizeSponsorPlacement = (value?: string): CommunitySponsorPlacement =>
  value === "top" ? "top" : "standard";

const normalizeExternalUrl = (value?: string) => {
  const trimmed = value?.trim() || "";
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const normalizeSponsors = (value: unknown): CommunitySponsor[] => {
  if (!Array.isArray(value)) return [];

  return (value as Array<Partial<CommunitySponsor>>)
    .filter(
      (item) =>
        item &&
        typeof item.name === "string" &&
        typeof item.description === "string" &&
        typeof item.image === "string"
    )
    .map((item) => ({
      id: item.id?.trim() || crypto.randomUUID(),
      name: item.name!.trim(),
      description: item.description!.trim(),
      image: item.image!.trim(),
      placement: normalizeSponsorPlacement(typeof item.placement === "string" ? item.placement : undefined),
      ...(item.websiteUrl?.trim() ? { websiteUrl: normalizeExternalUrl(item.websiteUrl) } : {}),
      ...(item.instagramUrl?.trim() ? { instagramUrl: normalizeExternalUrl(item.instagramUrl) } : {}),
    }));
};

const readSponsorsFromFile = async (): Promise<CommunitySponsor[]> => {
  const content = await fs.readFile(sponsorsFilePath, "utf8");
  return normalizeSponsors(JSON.parse(content));
};

export const readCommunitySponsors = async (): Promise<CommunitySponsor[]> => {
  const supabase = getSupabaseServiceRole();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", COMMUNITY_SPONSORS_SETTINGS_KEY)
        .maybeSingle();

      if (!error && data) {
        return normalizeSponsors(data.value);
      }
    } catch {
      // Fall back to the local file store when the database is unavailable.
    }
  }

  try {
    return await readSponsorsFromFile();
  } catch {
    return [];
  }
};

export const writeCommunitySponsors = async (value: CommunitySponsor[]): Promise<CommunitySponsor[]> => {
  const next = normalizeSponsors(value);
  const supabase = getSupabaseServiceRole();

  if (supabase) {
    const { error } = await supabase.from("app_settings").upsert(
      {
        key: COMMUNITY_SPONSORS_SETTINGS_KEY,
        value: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );

    if (error) {
      throw error;
    }

    return next;
  }

  await fs.mkdir(path.dirname(sponsorsFilePath), { recursive: true });
  await fs.writeFile(sponsorsFilePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
};
