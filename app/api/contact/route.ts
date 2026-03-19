import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const contactToEmail = process.env.CONTACT_TO_EMAIL;
const contactFromEmail = process.env.CONTACT_FROM_EMAIL;

const getSupabase = () => {
  if (!supabaseUrl) return null;
  const key = supabaseServiceRoleKey || supabaseAnonKey;
  if (!key) return null;
  return createClient(supabaseUrl, key);
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const sendContactEmail = async (payload: { name: string; email: string; message: string }) => {
  if (!resendApiKey || !contactToEmail || !contactFromEmail) {
    return { sent: false, skipped: true as const };
  }

  const html = `
    <h2>New Contact Message</h2>
    <p><strong>Name:</strong> ${escapeHtml(payload.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(payload.email)}</p>
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(payload.message).replaceAll("\n", "<br />")}</p>
  `;

  const text = `New Contact Message

Name: ${payload.name}
Email: ${payload.email}

Message:
${payload.message}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: contactFromEmail,
      to: contactToEmail.split(",").map((entry) => entry.trim()).filter(Boolean),
      subject: `New contact form message from ${payload.name}`,
      reply_to: payload.email,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || "Could not send email.");
  }

  return { sent: true as const, skipped: false as const };
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<{
      name: string;
      email: string;
      message: string;
    }>;

    const name = body.name?.trim() || "";
    const email = body.email?.trim() || "";
    const message = body.message?.trim() || "";

    if (!name || !email || !message) {
      return NextResponse.json({ error: "Name, email, and message are required." }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
    }

    const { error: insertError } = await supabase.from("contact_messages").insert({
      name,
      email,
      message,
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message ?? "Could not save message." }, { status: 500 });
    }

    try {
      const emailResult = await sendContactEmail({ name, email, message });
      if (emailResult.skipped) {
        return NextResponse.json({
          ok: true,
          message:
            "Message saved. Email forwarding is not configured yet. Set RESEND_API_KEY, CONTACT_TO_EMAIL, and CONTACT_FROM_EMAIL.",
        });
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Could not send email notification.";
      return NextResponse.json({
        ok: true,
        message: "Message saved, but the email notification failed.",
        email_error: messageText,
      });
    }

    return NextResponse.json({ ok: true, message: "Message sent. We will get back to you soon." });
  } catch {
    return NextResponse.json({ error: "Could not send message." }, { status: 500 });
  }
}
