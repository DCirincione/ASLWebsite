import { NextRequest, NextResponse } from "next/server";

import { getBearerToken, getSupabaseWithToken, isAdminOrOwner } from "@/lib/admin-route-auth";
import { isInboxAnnouncementAudience, isMissingInboxTableError } from "@/lib/inbox";
import type { UserInboxMessageInsert } from "@/lib/supabase/types";

type AnnouncementBody = {
  audience?: unknown;
  recipientIds?: unknown;
  title?: unknown;
  message?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const allowed = await isAdminOrOwner(req);
    if (!allowed) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const supabase = getSupabaseWithToken(token);
    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
    }

    const body = (await req.json()) as AnnouncementBody;
    const audience = body.audience;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const requestedRecipientIds = Array.isArray(body.recipientIds)
      ? body.recipientIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];

    if (!isInboxAnnouncementAudience(audience)) {
      return NextResponse.json({ error: "Choose who should receive the announcement." }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    if (audience === "selected_players" && requestedRecipientIds.length === 0) {
      return NextResponse.json({ error: "Choose at least one member." }, { status: 400 });
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user?.id) {
      return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
    }

    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .maybeSingle();

    const senderName = typeof senderProfile?.name === "string" ? senderProfile.name.trim() || null : null;

    let recipientProfiles: Array<{ id: string }> = [];

    if (audience === "all_players") {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .order("name", { ascending: true });

      if (error) {
        return NextResponse.json({ error: error.message ?? "Could not load site members." }, { status: 500 });
      }

      recipientProfiles = (data ?? []) as Array<{ id: string }>;
    } else {
      const uniqueRecipientIds = Array.from(new Set(requestedRecipientIds));
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .in("id", uniqueRecipientIds);

      if (error) {
        return NextResponse.json({ error: error.message ?? "Could not load selected members." }, { status: 500 });
      }

      recipientProfiles = (data ?? []) as Array<{ id: string }>;
    }

    const recipientIds = Array.from(new Set(recipientProfiles.map((profile) => profile.id)));

    if (recipientIds.length === 0) {
      return NextResponse.json({ error: "No site members matched this audience." }, { status: 400 });
    }

    const payload: UserInboxMessageInsert[] = recipientIds.map((recipientId) => ({
      recipient_user_id: recipientId,
      sender_user_id: user.id,
      sender_name: senderName,
      title,
      message,
      category: "announcement",
      audience,
      is_read: false,
      read_at: null,
    }));

    const { error: insertError } = await supabase.from("user_inbox_messages").insert(payload);

    if (insertError) {
      const normalizedMessage = isMissingInboxTableError(insertError.message)
        ? "Inbox storage is not set up yet. Run data/user-inbox-messages.sql in Supabase first."
        : insertError.message ?? "Could not send the announcement.";
      return NextResponse.json({ error: normalizedMessage }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      sentCount: recipientIds.length,
      audience,
    });
  } catch {
    return NextResponse.json({ error: "Could not send the announcement." }, { status: 500 });
  }
}
