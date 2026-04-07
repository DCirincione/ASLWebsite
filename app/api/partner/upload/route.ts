import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedProfile, getSupabaseServiceRole } from "@/lib/admin-route-auth";
import { canAccessPartnerPortal } from "@/lib/event-approval";

export const runtime = "nodejs";

const EVENT_IMAGE_BUCKET = "event-creation-uploads";
const FLYER_BUCKET = "flyers";

const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

const uploadConfigs = {
  "partner-logo": {
    bucket: EVENT_IMAGE_BUCKET,
    folder: "partner-applications/logos",
    allow: () => true,
    validate: (file: File) => file.type.startsWith("image/"),
    invalidMessage: "Please upload a valid logo image file.",
  },
  "event-image": {
    bucket: EVENT_IMAGE_BUCKET,
    folder: "events",
    allow: (role?: string | null) => canAccessPartnerPortal(role as never),
    validate: (file: File) => file.type.startsWith("image/"),
    invalidMessage: "Please upload a valid image file.",
  },
  "event-flyer": {
    bucket: FLYER_BUCKET,
    folder: "events",
    allow: (role?: string | null) => canAccessPartnerPortal(role as never),
    validate: (file: File) => file.type.startsWith("image/"),
    invalidMessage: "Please upload a valid flyer image file.",
  },
  "event-waiver": {
    bucket: EVENT_IMAGE_BUCKET,
    folder: "events/waivers",
    allow: (role?: string | null) => canAccessPartnerPortal(role as never),
    validate: (file: File) =>
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"),
    invalidMessage: "Please upload a valid PDF waiver file.",
  },
} as const;

type UploadKind = keyof typeof uploadConfigs;

const isUploadKind = (value: unknown): value is UploadKind =>
  typeof value === "string" && value in uploadConfigs;

export async function POST(req: NextRequest) {
  try {
    const profile = await getAuthenticatedProfile(req);
    if (!profile) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const uploader = getSupabaseServiceRole();
    if (!uploader) {
      return NextResponse.json(
        { error: "Partner uploads require SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY to be set on the server." },
        { status: 500 },
      );
    }

    const formData = await req.formData();
    const kindEntry = formData.get("kind");
    const fileEntry = formData.get("file");

    if (!isUploadKind(kindEntry)) {
      return NextResponse.json({ error: "Upload type is required." }, { status: 400 });
    }
    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    const config = uploadConfigs[kindEntry];
    if (!config.allow(profile.role)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }
    if (!config.validate(fileEntry)) {
      return NextResponse.json({ error: config.invalidMessage }, { status: 400 });
    }

    const ext = fileEntry.name.split(".").pop()?.toLowerCase() || (kindEntry === "event-waiver" ? "pdf" : "png");
    const baseName = fileEntry.name.replace(new RegExp(`\\.${ext}$`, "i"), "");
    const uploadPath = `${config.folder}/${crypto.randomUUID()}-${safeFileName(baseName)}.${ext}`;

    const { data, error } = await uploader.storage.from(config.bucket).upload(uploadPath, fileEntry, {
      cacheControl: "3600",
      upsert: false,
    });

    if (error) {
      const message = error.message || "Could not upload file.";
      const normalizedMessage = message.includes("row-level security")
        ? "Upload is blocked by Supabase Storage permissions. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY on the server to bypass storage RLS for partner uploads."
        : message;
      return NextResponse.json({ error: normalizedMessage }, { status: 500 });
    }

    const finalPath = data?.path ?? uploadPath;
    const { data: publicUrlData } = uploader.storage.from(config.bucket).getPublicUrl(finalPath);

    return NextResponse.json({
      ok: true,
      bucket: config.bucket,
      fileUrl: publicUrlData.publicUrl,
      path: finalPath,
    });
  } catch {
    return NextResponse.json({ error: "Could not upload file." }, { status: 500 });
  }
}
