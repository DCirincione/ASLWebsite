import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

import { isAdminOrOwner } from "@/lib/admin-route-auth";

type CommunityArticle = {
  id: string;
  title: string;
  blurb: string;
  href: string;
  date?: string;
  image?: string;
};

const articlesFilePath = path.join(process.cwd(), "data", "community-articles.json");

const readArticles = async (): Promise<CommunityArticle[]> => {
  const content = await fs.readFile(articlesFilePath, "utf8");
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) return [];
  return (parsed as Array<Partial<CommunityArticle>>)
    .filter((item) => item && typeof item.title === "string" && typeof item.blurb === "string" && typeof item.href === "string")
    .map((item) => ({
      id: item.id?.trim() || crypto.randomUUID(),
      title: item.title!.trim(),
      blurb: item.blurb!.trim(),
      href: item.href!.trim(),
      ...(item.date?.trim() ? { date: item.date.trim() } : {}),
      ...(item.image?.trim() ? { image: item.image.trim() } : {}),
    }));
};

export async function GET() {
  try {
    const articles = await readArticles();
    return NextResponse.json({ articles });
  } catch {
    return NextResponse.json({ error: "Could not read community articles." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const allowed = await isAdminOrOwner(req);
    if (!allowed) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }

    const body = (await req.json()) as Partial<CommunityArticle>;
    const title = body.title?.trim() || "";
    const blurb = body.blurb?.trim() || "";
    const href = body.href?.trim() || "";
    const date = body.date?.trim() || "";
    const image = body.image?.trim() || "";

    if (!title || !blurb || !href) {
      return NextResponse.json({ error: "Title, blurb, and link are required." }, { status: 400 });
    }

    const article: CommunityArticle = {
      id: crypto.randomUUID(),
      title,
      blurb,
      href,
      ...(date ? { date } : {}),
      ...(image ? { image } : {}),
    };

    const current = await readArticles();
    const next = [article, ...current];
    await fs.writeFile(articlesFilePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");

    return NextResponse.json({ ok: true, article, articles: next });
  } catch {
    return NextResponse.json({ error: "Could not save article." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const allowed = await isAdminOrOwner(req);
    if (!allowed) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }

    const body = (await req.json()) as Partial<CommunityArticle>;
    const id = body.id?.trim() || "";
    const title = body.title?.trim() || "";
    const blurb = body.blurb?.trim() || "";
    const href = body.href?.trim() || "";
    const date = body.date?.trim() || "";
    const image = body.image?.trim() || "";

    if (!id || !title || !blurb || !href) {
      return NextResponse.json({ error: "ID, title, blurb, and link are required." }, { status: 400 });
    }

    const current = await readArticles();
    const next = current.map((article) =>
      article.id === id
        ? {
            id,
            title,
            blurb,
            href,
            ...(date ? { date } : {}),
            ...(image ? { image } : {}),
          }
        : article
    );

    await fs.writeFile(articlesFilePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return NextResponse.json({ ok: true, articles: next });
  } catch {
    return NextResponse.json({ error: "Could not update article." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const allowed = await isAdminOrOwner(req);
    if (!allowed) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }

    const body = (await req.json()) as { id?: string };
    const id = body.id?.trim() || "";
    if (!id) {
      return NextResponse.json({ error: "Article ID is required." }, { status: 400 });
    }

    const current = await readArticles();
    const next = current.filter((article) => article.id !== id);
    await fs.writeFile(articlesFilePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return NextResponse.json({ ok: true, articles: next });
  } catch {
    return NextResponse.json({ error: "Could not delete article." }, { status: 500 });
  }
}
