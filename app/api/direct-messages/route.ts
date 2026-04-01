import { NextRequest, NextResponse } from "next/server";

import { getBearerToken, getSupabaseWithToken } from "@/lib/admin-route-auth";
import { decryptDirectMessage, encryptDirectMessage } from "@/lib/direct-messages-server";
import type { UserDirectMessage } from "@/lib/supabase/types";

type DirectMessagesContext =
  | { userId: string; supabase: NonNullable<ReturnType<typeof getSupabaseWithToken>> }
  | { response: NextResponse };

const getDirectMessagesContext = async (req: NextRequest): Promise<DirectMessagesContext> => {
  const token = getBearerToken(req);
  if (!token) {
    return { response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  const supabase = getSupabaseWithToken(token);
  if (!supabase) {
    return { response: NextResponse.json({ error: "Supabase is not configured." }, { status: 500 }) };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const userId = userData.user?.id ?? null;
  if (userError || !userId) {
    return { response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  return { userId, supabase };
};

const decryptMessages = (messages: UserDirectMessage[]) =>
  messages.map((message) => ({
    ...message,
    message: decryptDirectMessage(message.message),
  }));

export async function GET(req: NextRequest) {
  try {
    const context = await getDirectMessagesContext(req);
    if ("response" in context) {
      return context.response;
    }

    const { userId, supabase } = context;
    const { data, error } = await supabase
      .from("user_direct_messages")
      .select("*")
      .or(`sender_user_id.eq.${userId},recipient_user_id.eq.${userId}`)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message ?? "Could not load direct messages." }, { status: 500 });
    }

    return NextResponse.json({ messages: decryptMessages((data ?? []) as UserDirectMessage[]) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load direct messages." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getDirectMessagesContext(req);
    if ("response" in context) {
      return context.response;
    }

    const { userId, supabase } = context;
    const body = (await req.json()) as { recipientUserId?: string; message?: string };
    const recipientUserId = body.recipientUserId?.trim() ?? "";
    const message = body.message?.trim() ?? "";

    if (!recipientUserId || !message) {
      return NextResponse.json({ error: "Recipient and message are required." }, { status: 400 });
    }

    if (recipientUserId === userId) {
      return NextResponse.json({ error: "You cannot message yourself." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("user_direct_messages")
      .insert({
        sender_user_id: userId,
        recipient_user_id: recipientUserId,
        message: encryptDirectMessage(message),
        is_read: false,
        read_at: null,
      })
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Could not send the message." }, { status: 500 });
    }

    const [decryptedMessage] = decryptMessages([data as UserDirectMessage]);
    return NextResponse.json({ message: decryptedMessage });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not send the message." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const context = await getDirectMessagesContext(req);
    if ("response" in context) {
      return context.response;
    }

    const { userId, supabase } = context;
    const body = (await req.json()) as { messageIds?: string[]; readAt?: string };
    const messageIds = Array.isArray(body.messageIds)
      ? Array.from(new Set(body.messageIds.map((value) => value?.trim()).filter(Boolean)))
      : [];
    const readAt = body.readAt?.trim() || new Date().toISOString();

    if (messageIds.length === 0) {
      return NextResponse.json({ updatedIds: [], readAt });
    }

    const { data, error } = await supabase
      .from("user_direct_messages")
      .update({
        is_read: true,
        read_at: readAt,
      })
      .in("id", messageIds)
      .eq("recipient_user_id", userId)
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message ?? "Could not mark direct messages as read." }, { status: 500 });
    }

    const updatedIds = ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
    return NextResponse.json({ updatedIds, readAt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not mark direct messages as read." },
      { status: 500 },
    );
  }
}
