import "server-only";

import { promises as fs } from "fs";
import path from "path";

import { getSupabaseServiceRole } from "@/lib/admin-route-auth";

export type CommunityArticle = {
  id: string;
  title: string;
  blurb: string;
  href: string;
  date?: string;
  image?: string;
};

const COMMUNITY_ARTICLES_SETTINGS_KEY = "community_articles";
const articlesFilePath = path.join(process.cwd(), "data", "community-articles.json");

const normalizeArticles = (value: unknown): CommunityArticle[] => {
  if (!Array.isArray(value)) return [];

  return (value as Array<Partial<CommunityArticle>>)
    .filter(
      (item) =>
        item &&
        typeof item.title === "string" &&
        typeof item.blurb === "string" &&
        typeof item.href === "string",
    )
    .map((item) => ({
      id: item.id?.trim() || crypto.randomUUID(),
      title: item.title!.trim(),
      blurb: item.blurb!.trim(),
      href: item.href!.trim(),
      ...(item.date?.trim() ? { date: item.date.trim() } : {}),
      ...(item.image?.trim() ? { image: item.image.trim() } : {}),
    }));
};

const readArticlesFromFile = async (): Promise<CommunityArticle[]> => {
  const content = await fs.readFile(articlesFilePath, "utf8");
  return normalizeArticles(JSON.parse(content));
};

export const readCommunityArticles = async (): Promise<CommunityArticle[]> => {
  const supabase = getSupabaseServiceRole();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", COMMUNITY_ARTICLES_SETTINGS_KEY)
        .maybeSingle();

      if (!error && data) {
        return normalizeArticles(data.value);
      }
    } catch {
      // Fall back to the local file store when the database is unavailable.
    }
  }

  try {
    return await readArticlesFromFile();
  } catch {
    return [];
  }
};

export const writeCommunityArticles = async (value: CommunityArticle[]): Promise<CommunityArticle[]> => {
  const next = normalizeArticles(value);
  const supabase = getSupabaseServiceRole();

  if (supabase) {
    const { error } = await supabase.from("app_settings").upsert(
      {
        key: COMMUNITY_ARTICLES_SETTINGS_KEY,
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

  await fs.mkdir(path.dirname(articlesFilePath), { recursive: true });
  await fs.writeFile(articlesFilePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
};
