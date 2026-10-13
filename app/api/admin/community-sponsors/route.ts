import { NextRequest, NextResponse } from "next/server";

import { isAdminOrOwner } from "@/lib/admin-route-auth";
import {
  type CommunitySponsor,
  readCommunitySponsors,
  writeCommunitySponsors,
} from "@/lib/community-sponsors";

const normalizeSponsorPlacement = (value?: string): CommunitySponsor["placement"] =>
  value === "top" ? "top" : "standard";

const normalizeExternalUrl = (value?: string) => {
  const trimmed = value?.trim() || "";
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const countTopSponsors = (sponsors: CommunitySponsor[], excludedId?: string) =>
  sponsors.filter((sponsor) => sponsor.placement === "top" && sponsor.id !== excludedId).length;

export async function GET() {
  try {
    const sponsors = await readCommunitySponsors();
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

    const current = await readCommunitySponsors();
    if (placement === "top" && countTopSponsors(current) >= 3) {
      return NextResponse.json({ error: "Top Sponsors can contain up to three sponsors." }, { status: 400 });
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
    await writeCommunitySponsors(next);

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

    const current = await readCommunitySponsors();
    if (placement === "top" && countTopSponsors(current, id) >= 3) {
      return NextResponse.json({ error: "Top Sponsors can contain up to three sponsors." }, { status: 400 });
    }

    const next: CommunitySponsor[] = current.map((sponsor) =>
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

    await writeCommunitySponsors(next);
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

    const current = await readCommunitySponsors();
    const next = current.filter((sponsor) => sponsor.id !== id);
    await writeCommunitySponsors(next);
    return NextResponse.json({ ok: true, sponsors: next });
  } catch {
    return NextResponse.json({ error: "Could not delete sponsor." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!(await isAdminOrOwner(req))) return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    const { placement, ids } = await req.json();
    if (!["top", "standard"].includes(placement) || !Array.isArray(ids) || ids.some(id => typeof id !== "string") || new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: "Invalid sponsor order." }, { status: 400 });
    }
    const current = await readCommunitySponsors();
    const group = current.filter(sponsor => sponsor.placement === placement);
    const byId = new Map(group.map(sponsor => [sponsor.id, sponsor]));
    if (ids.length !== group.length || ids.some(id => !byId.has(id))) {
      return NextResponse.json({ error: "The sponsor list changed. Refresh and try again." }, { status: 409 });
    }
    let index = 0;
    const next = current.map(sponsor => sponsor.placement === placement ? byId.get(ids[index++])! : sponsor);
    await writeCommunitySponsors(next);
    return NextResponse.json({ sponsors: next });
  } catch {
    return NextResponse.json({ error: "Could not save sponsor order." }, { status: 500 });
  }
}
