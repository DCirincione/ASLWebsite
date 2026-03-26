import { NextRequest, NextResponse } from "next/server";

import { isAdminOrOwner } from "@/lib/admin-route-auth";

const extractMetaContent = (html: string, matcher: RegExp) => {
  const match = html.match(matcher);
  if (!match) return "";
  return (match[1] || match[2] || "").trim();
};

const stripTags = (value: string) => value.replace(/<[^>]+>/g, "").trim();

const extractMetaTags = (html: string) => {
  const tags = html.match(/<meta\s+[^>]*>/gi) ?? [];
  const map = new Map<string, string>();
  for (const tag of tags) {
    const attrs = new Map<string, string>();
    const attrRegex = /([:@\w-]+)\s*=\s*["']([^"']*)["']/g;
    let match: RegExpExecArray | null = null;
    while ((match = attrRegex.exec(tag)) !== null) {
      attrs.set(match[1].toLowerCase(), match[2]);
    }
    const key = (attrs.get("property") || attrs.get("name") || "").toLowerCase();
    const value = (attrs.get("content") || "").trim();
    if (key && value) {
      map.set(key, value);
    }
  }
  return map;
};

const extractJsonLd = (html: string) => {
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  const parsed: Array<Record<string, unknown>> = [];
  for (const script of scripts) {
    const contentMatch = script.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    const content = contentMatch?.[1]?.trim();
    if (!content) continue;
    try {
      const json = JSON.parse(content);
      if (Array.isArray(json)) {
        for (const item of json) {
          if (item && typeof item === "object") {
            parsed.push(item as Record<string, unknown>);
          }
        }
      } else if (json && typeof json === "object") {
        parsed.push(json as Record<string, unknown>);
      }
    } catch {
      continue;
    }
  }
  return parsed;
};

const toAbsoluteUrl = (baseUrl: URL, value: string) => {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
};

export async function POST(req: NextRequest) {
  try {
    const allowed = await isAdminOrOwner(req);
    if (!allowed) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }

    const body = (await req.json()) as { href?: string };
    const href = body.href?.trim() || "";
    if (!href) {
      return NextResponse.json({ error: "Article URL is required." }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      return NextResponse.json({ error: "Invalid URL format." }, { status: 400 });
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ error: "Only http(s) URLs are supported." }, { status: 400 });
    }

    const response = await fetch(parsed.toString(), {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; ASLWebsiteBot/1.0)",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Could not fetch article (${response.status}).` }, { status: 400 });
    }

    const html = await response.text();
    const metaTags = extractMetaTags(html);
    const jsonLdItems = extractJsonLd(html);
    const jsonLdHeadline = String(
      jsonLdItems.find((item) => typeof item.headline === "string")?.headline ?? ""
    );
    const jsonLdDescription = String(
      jsonLdItems.find((item) => typeof item.description === "string")?.description ?? ""
    );
    const jsonLdImageRaw = jsonLdItems.find((item) => item.image)?.image;
    const jsonLdImage =
      typeof jsonLdImageRaw === "string"
        ? jsonLdImageRaw
        : Array.isArray(jsonLdImageRaw) && typeof jsonLdImageRaw[0] === "string"
          ? String(jsonLdImageRaw[0])
          : "";

    const titleTag = extractMetaContent(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const firstParagraph = extractMetaContent(html, /<p[^>]*>([\s\S]*?)<\/p>/i);

    const title = stripTags(
      metaTags.get("og:title") ||
        metaTags.get("twitter:title") ||
        jsonLdHeadline ||
        titleTag
    );
    const blurb = stripTags(
      metaTags.get("og:description") ||
        metaTags.get("twitter:description") ||
        metaTags.get("description") ||
        jsonLdDescription ||
        firstParagraph
    );
    const imageRaw =
      metaTags.get("og:image") ||
      metaTags.get("twitter:image") ||
      jsonLdImage ||
      "";
    const image = imageRaw ? toAbsoluteUrl(parsed, imageRaw.trim()) : "";

    return NextResponse.json({
      title,
      blurb,
      image,
    });
  } catch {
    return NextResponse.json({ error: "Could not auto-fill from URL." }, { status: 500 });
  }
}
