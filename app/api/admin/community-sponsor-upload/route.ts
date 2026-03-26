import { NextRequest, NextResponse } from "next/server";

import { getSupabaseServiceRole, isAdminOrOwner } from "@/lib/admin-route-auth";

const EVENT_IMAGE_BUCKET = "event-creation-uploads";
const COMMUNITY_SPONSOR_IMAGE_FOLDER = "events/community-sponsors";

const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

export async function POST(req: NextRequest) {
  try {
    const allowed = await isAdminOrOwner(req);
    if (!allowed) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }

    const uploader = getSupabaseServiceRole();
    if (!uploader) {
      return NextResponse.json(
        { error: "Sponsor image uploads require SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY to be set on the server." },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const fileEntry = formData.get("file");
    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }
    if (!fileEntry.type.startsWith("image/")) {
      return NextResponse.json({ error: "Please upload a valid image file." }, { status: 400 });
    }

    const ext = fileEntry.name.split(".").pop()?.toLowerCase() || "png";
    const baseName = fileEntry.name.replace(new RegExp(`\\.${ext}$`, "i"), "");
    const uploadPath = `${COMMUNITY_SPONSOR_IMAGE_FOLDER}/${crypto.randomUUID()}-${safeFileName(baseName)}.${ext}`;

    const { data, error } = await uploader.storage.from(EVENT_IMAGE_BUCKET).upload(uploadPath, fileEntry, {
      cacheControl: "3600",
      upsert: false,
    });

    if (error) {
      const message = error.message || "Could not upload image.";
      const normalizedMessage = message.includes("row-level security")
        ? "Sponsor image upload is blocked by Supabase Storage permissions. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY on the server to bypass storage RLS for admin uploads."
        : message;
      return NextResponse.json({ error: normalizedMessage }, { status: 500 });
    }

    const finalPath = data?.path ?? uploadPath;
    const { data: publicUrlData } = uploader.storage.from(EVENT_IMAGE_BUCKET).getPublicUrl(finalPath);

    return NextResponse.json({ ok: true, imageUrl: publicUrlData.publicUrl, path: finalPath });
  } catch {
    return NextResponse.json({ error: "Could not upload sponsor image." }, { status: 500 });
  }
}
