import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "fs";
import path from "path";

type CommunityContent = {
  boardTitle: string;
  paragraphs: string[];
};

const contentFilePath = path.join(process.cwd(), "data", "community-content.json");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const getSupabase = () => {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey);
};

const isAdminOrOwner = async (req: NextRequest) => {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return false;

  const supabase = getSupabase();
  if (!supabase) return false;

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user?.id) return false;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) return false;
  return profile?.role === "admin" || profile?.role === "owner";
};

const readContent = async (): Promise<CommunityContent> => {
  const content = await fs.readFile(contentFilePath, "utf8");
  const parsed = JSON.parse(content) as Partial<CommunityContent>;
  return {
    boardTitle: parsed.boardTitle?.trim() || "COMMUNITY FIRST, ALWAYS.",
    paragraphs: Array.isArray(parsed.paragraphs) ? parsed.paragraphs.map((p) => String(p)) : [],
  };
};

export async function GET() {
  try {
    const content = await readContent();
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ error: "Could not load community content." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const allowed = await isAdminOrOwner(req);
    if (!allowed) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }

    const body = (await req.json()) as Partial<CommunityContent>;
    const boardTitle = body.boardTitle?.trim() || "";
    const paragraphs = Array.isArray(body.paragraphs)
      ? body.paragraphs.map((p) => String(p).trim()).filter(Boolean)
      : [];

    if (!boardTitle) {
      return NextResponse.json({ error: "Board title is required." }, { status: 400 });
    }
    if (paragraphs.length === 0) {
      return NextResponse.json({ error: "At least one paragraph is required." }, { status: 400 });
    }

    const next: CommunityContent = {
      boardTitle,
      paragraphs,
    };

    await fs.writeFile(contentFilePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return NextResponse.json({ ok: true, content: next });
  } catch {
    return NextResponse.json({ error: "Could not update community content." }, { status: 500 });
  }
}
