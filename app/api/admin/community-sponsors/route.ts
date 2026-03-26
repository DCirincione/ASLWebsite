import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

import { isAdminOrOwner } from "@/lib/admin-route-auth";

type CommunitySponsorPlacement = "standard" | "top";

type CommunitySponsor = {
  id: string;
  name: string;
  description: string;
  image: string;
  placement: CommunitySponsorPlacement;
  websiteUrl?: string;
  instagramUrl?: string;
};

const sponsorsFilePath = path.join(process.cwd(), "data", "community-sponsors.json");

const normalizeSponsorPlacement = (value?: string): CommunitySponsorPlacement =>
  value === "top" ? "top" : "standard";

const normalizeExternalUrl = (value?: string) => {
  const trimmed = value?.trim() || "";
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const countTopSponsors = (sponsors: CommunitySponsor[], excludedId?: string) =>
  sponsors.filter((sponsor) => sponsor.placement === "top" && sponsor.id !== excludedId).length;

const readSponsors = async (): Promise<CommunitySponsor[]> => {
  const content = await fs.readFile(sponsorsFilePath, "utf8");
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) return [];
  return (parsed as Array<Partial<CommunitySponsor>>)
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

export async function GET() {
  try {
    const sponsors = await readSponsors();
    return NextResponse.json({ sponsors });
  } catch {
    return NextResponse.json({ error: "Could not read community sponsors." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const allowed = await isAdminOrOwner(req);
    if (!allowed) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }

    const body = (await req.json()) as Partial<CommunitySponsor>;
    const name = body.name?.trim() || "";
    const description = body.description?.trim() || "";
    const image = body.image?.trim() || "";
    const placement = normalizeSponsorPlacement(body.placement);
    const websiteUrl = normalizeExternalUrl(body.websiteUrl);
    const instagramUrl = normalizeExternalUrl(body.instagramUrl);

    if (!name || !description || !image) {
      return NextResponse.json({ error: "Name, description, and image are required." }, { status: 400 });
    }

    const current = await readSponsors();
    if (placement === "top" && countTopSponsors(current) >= 2) {
      return NextResponse.json({ error: "Top Sponsors can only contain two sponsors." }, { status: 400 });
    }

    const sponsor: CommunitySponsor = {
      id: crypto.randomUUID(),
      name,
      description,
      image,
      placement,
      ...(websiteUrl ? { websiteUrl } : {}),
      ...(instagramUrl ? { instagramUrl } : {}),
    };

    const next = [sponsor, ...current];
    await fs.writeFile(sponsorsFilePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");

    return NextResponse.json({ ok: true, sponsor, sponsors: next });
  } catch {
    return NextResponse.json({ error: "Could not save sponsor." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const allowed = await isAdminOrOwner(req);
    if (!allowed) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }

    const body = (await req.json()) as Partial<CommunitySponsor>;
    const id = body.id?.trim() || "";
    const name = body.name?.trim() || "";
    const description = body.description?.trim() || "";
    const image = body.image?.trim() || "";
    const placement = normalizeSponsorPlacement(body.placement);
    const websiteUrl = normalizeExternalUrl(body.websiteUrl);
    const instagramUrl = normalizeExternalUrl(body.instagramUrl);

    if (!id || !name || !description || !image) {
      return NextResponse.json({ error: "ID, name, description, and image are required." }, { status: 400 });
    }

    const current = await readSponsors();
    if (placement === "top" && countTopSponsors(current, id) >= 2) {
      return NextResponse.json({ error: "Top Sponsors can only contain two sponsors." }, { status: 400 });
    }

    const next = current.map((sponsor) =>
      sponsor.id === id
        ? {
            id,
            name,
            description,
            image,
            placement,
            ...(websiteUrl ? { websiteUrl } : {}),
            ...(instagramUrl ? { instagramUrl } : {}),
          }
        : sponsor
    );

    await fs.writeFile(sponsorsFilePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return NextResponse.json({ ok: true, sponsors: next });
  } catch {
    return NextResponse.json({ error: "Could not update sponsor." }, { status: 500 });
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
      return NextResponse.json({ error: "Sponsor ID is required." }, { status: 400 });
    }

    const current = await readSponsors();
    const next = current.filter((sponsor) => sponsor.id !== id);
    await fs.writeFile(sponsorsFilePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return NextResponse.json({ ok: true, sponsors: next });
  } catch {
    return NextResponse.json({ error: "Could not delete sponsor." }, { status: 500 });
  }
}
