import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  appendAldrichCommunicationsPreferenceToMessage,
  ALDRICH_COMMUNICATIONS_LABEL,
} from "@/lib/aldrich-communications";
import {
  getRecaptchaMinScore,
  getRecaptchaSecretKey,
  RECAPTCHA_CONTACT_ACTION,
  RECAPTCHA_SECRET_KEY_ENV_NAMES,
} from "@/lib/recaptcha";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const contactToEmail = process.env.CONTACT_TO_EMAIL;
const contactFromEmail = process.env.CONTACT_FROM_EMAIL;
const recaptchaSecretKey = getRecaptchaSecretKey();
const recaptchaMinScore = getRecaptchaMinScore();
const recaptchaConfigMessage = `Contact form protection is not configured. Add ${RECAPTCHA_SECRET_KEY_ENV_NAMES.join(
  " or "
)} to the server environment.`;

const getSupabase = () => {
  if (!supabaseUrl) return null;
  const key = supabaseServiceRoleKey || supabaseAnonKey;
  if (!key) return null;
  return createClient(supabaseUrl, key);
};

const getMissingSupabaseConfig = () => {
  const missing: string[] = [];
  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseAnonKey && !supabaseServiceRoleKey) {
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY");
  }
  return missing;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

type ReCaptchaVerificationResponse = {
  success: boolean;
  score?: number;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

const isLocalDevelopmentRequest = (req: NextRequest) =>
  process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "::1"].includes(req.nextUrl.hostname);

const getRecaptchaFailureDetail = (result: ReCaptchaVerificationResponse | null) => {
  if (!result) return "no verification payload returned";

  const parts: string[] = [];
  if (Array.isArray(result["error-codes"]) && result["error-codes"].length > 0) {
    parts.push(`error-codes=${result["error-codes"].join(",")}`);
  }
  if (result.hostname) {
    parts.push(`hostname=${result.hostname}`);
  }
  if (result.action) {
    parts.push(`action=${result.action}`);
  }
  if (typeof result.score === "number") {
    parts.push(`score=${result.score}`);
  }

  return parts.join(" ") || "verification failed without a detailed error code";
};

const getRequestIp = (req: NextRequest) => {
  const cfIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;

  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || null;
};

const validateRecaptchaToken = async (req: NextRequest, token: string) => {
  const allowLocalBypass = isLocalDevelopmentRequest(req);

  if (!recaptchaSecretKey) {
    return { ok: false as const, status: 500, error: recaptchaConfigMessage };
  }

  if (!token.trim()) {
    return { ok: false as const, status: 400, error: "Verification failed. Please try again." };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const body = new URLSearchParams({
      secret: recaptchaSecretKey,
      response: token.trim(),
    });

    const remoteIp = getRequestIp(req);
    if (remoteIp) {
      body.set("remoteip", remoteIp);
    }

    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
      signal: controller.signal,
    });

    const result = (await response.json().catch(() => null)) as ReCaptchaVerificationResponse | null;
    if (!response.ok || !result?.success) {
      if (allowLocalBypass) {
        console.warn(`[contact] bypassing reCAPTCHA on localhost: ${getRecaptchaFailureDetail(result)}`);
        return { ok: true as const };
      }
      return { ok: false as const, status: 400, error: "Verification failed. Please try again." };
    }

    if (result.action && result.action !== RECAPTCHA_CONTACT_ACTION) {
      if (allowLocalBypass) {
        console.warn(
          `[contact] bypassing reCAPTCHA on localhost: expected action=${RECAPTCHA_CONTACT_ACTION} received action=${result.action}`
        );
        return { ok: true as const };
      }
      return { ok: false as const, status: 400, error: "Verification failed. Please try again." };
    }

    if (typeof result.score === "number" && result.score < recaptchaMinScore) {
      if (allowLocalBypass) {
        console.warn(
          `[contact] bypassing reCAPTCHA on localhost: score=${result.score} below threshold=${recaptchaMinScore}`
        );
        return { ok: true as const };
      }
      return { ok: false as const, status: 400, error: "Verification failed. Please try again." };
    }

    return { ok: true as const };
  } catch (error) {
    if (allowLocalBypass) {
      const reason = error instanceof Error ? error.message : "unknown verification error";
      console.warn(`[contact] bypassing reCAPTCHA on localhost after verification error: ${reason}`);
      return { ok: true as const };
    }
    return { ok: false as const, status: 502, error: "Verification failed. Please try again." };
  } finally {
    clearTimeout(timeoutId);
  }
};

const sendContactEmail = async (payload: { name: string; email: string; message: string; communicationsOptIn: boolean }) => {
  if (!resendApiKey || !contactToEmail || !contactFromEmail) {
    return { sent: false, skipped: true as const };
  }

  const html = `
    <h2>ASL Inquiry</h2>
    <p><strong>Full Name:</strong> ${escapeHtml(payload.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(payload.email)}</p>
    <p><strong>Communications Opt-In:</strong> ${payload.communicationsOptIn ? "Yes" : "No"}</p>
    <p><strong>Preference:</strong> ${escapeHtml(ALDRICH_COMMUNICATIONS_LABEL)}</p>
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(payload.message).replaceAll("\n", "<br />")}</p>
  `;

  const text = `ASL Inquiry

Full Name: ${payload.name}
Email: ${payload.email}
Communications Opt-In: ${payload.communicationsOptIn ? "Yes" : "No"}
Preference: ${ALDRICH_COMMUNICATIONS_LABEL}

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
      subject: "ASL Inquiry",
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
      communicationsOptIn: boolean;
      recaptchaToken: string;
    }>;

    const name = body.name?.trim() || "";
    const email = body.email?.trim() || "";
    const message = body.message?.trim() || "";
    const communicationsOptIn = body.communicationsOptIn !== false;
    const recaptchaToken = body.recaptchaToken?.trim() || "";

    if (!name || !email || !message) {
      return NextResponse.json({ error: "Full Name, email, and message are required." }, { status: 400 });
    }

    const recaptchaValidation = await validateRecaptchaToken(req, recaptchaToken);
    if (!recaptchaValidation.ok) {
      return NextResponse.json({ error: recaptchaValidation.error }, { status: recaptchaValidation.status });
    }

    const supabase = getSupabase();
    const missingSupabaseConfig = getMissingSupabaseConfig();
    let storageError: string | null = null;

    if (supabase) {
      const { error: insertError } = await supabase.from("contact_messages").insert({
        name,
        email,
        message: appendAldrichCommunicationsPreferenceToMessage(message, communicationsOptIn),
      });

      if (insertError) {
        storageError = insertError.message ?? "Could not save message.";
      }
    } else {
      storageError = `Supabase is not configured. Missing ${missingSupabaseConfig.join(", ")}.`;
    }

    try {
      const emailResult = await sendContactEmail({ name, email, message, communicationsOptIn });
      if (emailResult.skipped) {
        return NextResponse.json({
          ok: !storageError,
          message: storageError
            ? `${storageError} Email forwarding is also not configured yet. Set RESEND_API_KEY, CONTACT_TO_EMAIL, and CONTACT_FROM_EMAIL.`
            : "Message saved. Email forwarding is not configured yet. Set RESEND_API_KEY, CONTACT_TO_EMAIL, and CONTACT_FROM_EMAIL.",
        });
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Could not send email notification.";
      const responseMessage = storageError ? storageError : "Message saved, but the email notification failed.";
      return NextResponse.json(
        {
          ok: !storageError,
          error: responseMessage,
          message: responseMessage,
          email_error: messageText,
          storage_error: storageError ?? undefined,
        },
        { status: storageError ? 500 : 200 }
      );
    }

    if (storageError) {
      return NextResponse.json({
        ok: true,
        message: "Email sent, but the message was not saved to the admin inbox.",
        storage_error: storageError,
      });
    }

    return NextResponse.json({ ok: true, message: "Message sent. We will get back to you soon." });
  } catch {
    return NextResponse.json({ error: "Could not send message." }, { status: 500 });
  }
}
