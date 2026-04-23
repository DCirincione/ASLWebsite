"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";

type Status = { type: "idle" | "loading" | "success" | "error"; message?: string };
const PASSWORD_RESET_REDIRECT = "https://aldrichsports.com/reset-password";

type AccountSigninFormProps = {
  onSuccess?: () => void;
  redirectTo?: string | null;
};

export function AccountSigninForm({ onSuccess, redirectTo }: AccountSigninFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const [resetStatus, setResetStatus] = useState<Status>({ type: "idle" });
  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const update = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handlePasswordReset = async () => {
    if (!supabase) {
      setResetStatus({
        type: "error",
        message: "Supabase keys are missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      });
      return;
    }

    const email = form.email.trim();
    if (!email) {
      setResetStatus({ type: "error", message: "Enter your email first to receive a reset link." });
      return;
    }

    setResetStatus({ type: "loading" });

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: PASSWORD_RESET_REDIRECT,
    });

    if (error) {
      setResetStatus({ type: "error", message: error.message });
      return;
    }

    setResetStatus({
      type: "success",
      message: "Password reset email sent. Check your inbox for the reset link.",
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setStatus({
        type: "error",
        message: "Supabase keys are missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      });
      return;
    }

    setStatus({ type: "loading" });

    const { email, password } = form;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      setStatus({ type: "error", message: error?.message ?? "Unable to sign in. Check your inputs." });
      return;
    }

    setStatus({
      type: "success",
      message: redirectTo === null ? "Signed in! Finish your event signup below." : "Signed in! Redirecting to your account...",
    });
    onSuccess?.();
    if (redirectTo !== null) {
      router.push(redirectTo || "/account");
    }
  };

  return (
    <form className="account-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="form-control">
          <label htmlFor="signin-email">Email</label>
          <input
            id="signin-email"
            name="email"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            required
          />
        </div>
        <div className="form-control">
          <label htmlFor="signin-password">Password</label>
          <input
            id="signin-password"
            name="password"
            type="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            required
          />
        </div>
      </div>
      <div className="account-form__actions">
        <button
          className="account-form__link-action"
          type="button"
          onClick={() => void handlePasswordReset()}
          disabled={resetStatus.type === "loading"}
        >
          {resetStatus.type === "loading" ? "Sending reset email..." : "Forgot your password?"}
        </button>
      </div>
      {status.type === "error" ? <p className="form-help error">{status.message}</p> : null}
      {status.type === "success" ? <p className="form-help success">{status.message}</p> : null}
      {resetStatus.type === "error" ? <p className="form-help error">{resetStatus.message}</p> : null}
      {resetStatus.type === "success" ? <p className="form-help success">{resetStatus.message}</p> : null}
      <button className="button primary" type="submit" disabled={status.type === "loading"}>
        {status.type === "loading" ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
}
