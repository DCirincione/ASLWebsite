"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";

type Status = { type: "idle" | "loading" | "success" | "error"; message?: string };

type AccountSigninFormProps = {
  onSuccess?: () => void;
};

export function AccountSigninForm({ onSuccess }: AccountSigninFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const update = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
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

    setStatus({ type: "success", message: "Signed in! Redirecting to your account..." });
    onSuccess?.();
    router.push("/account");
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
      {status.type === "error" ? <p className="form-help error">{status.message}</p> : null}
      {status.type === "success" ? <p className="form-help success">{status.message}</p> : null}
      <button className="button primary" type="submit" disabled={status.type === "loading"}>
        {status.type === "loading" ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
}
