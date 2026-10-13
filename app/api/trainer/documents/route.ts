import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedProfile, getSupabaseServiceRole } from "@/lib/admin-route-auth";
async function authorize(req: NextRequest, trainerId: string) {
  const viewer = await getAuthenticatedProfile(req), db = getSupabaseServiceRole();
  if (!viewer || !db) return null;
  const { data } = await db.from("trainer_profiles").select("user_id").eq("id", trainerId).maybeSingle();
  return data && (data.user_id === viewer.id || ["admin", "owner"].includes(viewer.role ?? "")) ? db : null;
}
export async function GET(req: NextRequest) {
  const trainerId = req.nextUrl.searchParams.get("trainerId") ?? "", db = await authorize(req, trainerId);
  if (!db) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const { data, error } = await db.from("trainer_documents").select("id,path,name,created_at").eq("trainer_id", trainerId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Could not load documents." }, { status: 500 });
  const documents = await Promise.all((data ?? []).map(async d => ({ id: d.id, name: d.name, created_at: d.created_at, url: (await db.storage.from("trainer-documents").createSignedUrl(d.path, 300)).data?.signedUrl })));
  return NextResponse.json({ documents });
}
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData(), trainerId = String(form.get("trainerId") ?? ""), file = form.get("file");
    const db = await authorize(req, trainerId);
    if (!db) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    if (!(file instanceof File) || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Choose a PDF, PNG or JPEG under 10 MB." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 ? "application/pdf" : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg" : bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 ? "image/png" : null;
    if (!type) return NextResponse.json({ error: "Choose a valid PDF, PNG or JPEG." }, { status: 400 });
    const path = `${trainerId}/${crypto.randomUUID()}.${type === "application/pdf" ? "pdf" : type === "image/png" ? "png" : "jpg"}`;
    const uploaded = await db.storage.from("trainer-documents").upload(path, bytes, { contentType: type, upsert: false });
    if (uploaded.error) throw new Error("Upload failed.");
    const saved = await db.from("trainer_documents").insert({ trainer_id: trainerId, path, name: file.name.slice(0, 200) });
    if (saved.error) { await db.storage.from("trainer-documents").remove([path]); throw new Error("Could not save document."); }
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Could not upload your document." }, { status: 500 }); }
}
