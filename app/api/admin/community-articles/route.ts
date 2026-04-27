import { NextRequest, NextResponse } from "next/server";

import { isAdminOrOwner } from "@/lib/admin-route-auth";
import { type CommunityArticle, readCommunityArticles, writeCommunityArticles } from "@/lib/community-articles";

export async function GET() {
  try {
    const articles = await readCommunityArticles();
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

    const current = await readCommunityArticles();
    const next = [article, ...current];
    const articles = await writeCommunityArticles(next);

    return NextResponse.json({ ok: true, article, articles });
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

    const current = await readCommunityArticles();
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

    const articles = await writeCommunityArticles(next);
    return NextResponse.json({ ok: true, articles });
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

    const current = await readCommunityArticles();
    const next = current.filter((article) => article.id !== id);
    const articles = await writeCommunityArticles(next);
    return NextResponse.json({ ok: true, articles });
  } catch {
    return NextResponse.json({ error: "Could not delete article." }, { status: 500 });
  }
}
