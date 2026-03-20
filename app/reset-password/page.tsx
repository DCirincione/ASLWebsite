"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AccessibilityControls } from "@/components/accessibility-controls";
import { supabase } from "@/lib/supabase/client";

type SaveStatus = { type: "idle" | "loading" | "success" | "error"; message?: string };

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "invalid">("loading");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ type: "idle" });

  useEffect(() => {
    const loadRecoverySession = async () => {
      const client = supabase;
      if (!client) {
        setStatus("invalid");
        return;
      }

      const { data } = await client.auth.getSession();
      if (data.session) {
        setStatus("ready");
        return;
      }

      const { data: authListener } = client.auth.onAuthStateChange((event, session) => {
        if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
          setStatus("ready");
        }
      });

      // Give Supabase one tick to process recovery tokens from the URL.
      setTimeout(async () => {
        const { data: retryData } = await client.auth.getSession();
        setStatus(retryData.session ? "ready" : "invalid");
      }, 300);

      return () => authListener.subscription.unsubscribe();
    };

    void loadRecoverySession();
  }, []);

  const resetPassword = async () => {
    if (!supabase) {
      setSaveStatus({ type: "error", message: "Supabase is not configured." });
      return;
    }

    if (password.length < 8) {
      setSaveStatus({ type: "error", message: "New password must be at least 8 characters." });
      return;
    }

    if (password !== confirmPassword) {
      setSaveStatus({ type: "error", message: "Passwords do not match." });
      return;
    }

    setSaveStatus({ type: "loading" });
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setSaveStatus({ type: "error", message: error.message });
      return;
    }

    setPassword("");
    setConfirmPassword("");
    setSaveStatus({ type: "success", message: "Password updated. You can now sign in with your new password." });
  };

  return (
    <>
      <AccessibilityControls />
      <div className="account-body shell">
        <Link className="button ghost" href="/">
          ← Back
        </Link>

        <section className="account-card" style={{ maxWidth: 640, marginTop: 12 }}>
          <div className="account-card__header">
            <div>
              <h1>Reset Password</h1>
              <p className="muted">Choose a new password for your account.</p>
            </div>
          </div>

          {status === "loading" ? <p className="muted">Loading reset session...</p> : null}

          {status === "invalid" ? (
            <div style={{ display: "grid", gap: 12 }}>
              <p className="form-help error">This reset link is invalid or has expired.</p>
              <p className="muted">Go back to Settings and send a new reset email.</p>
              <Link className="button primary" href="/account/settings">
                Back to Settings
              </Link>
            </div>
          ) : null}

          {status === "ready" ? (
            <form
              className="account-form"
              style={{ borderTop: "none", paddingTop: 0 }}
              onSubmit={(event) => {
                event.preventDefault();
                void resetPassword();
              }}
            >
              <div className="form-control">
                <label htmlFor="reset-password">New password</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    id="reset-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                    required
                  />
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div className="form-control">
                <label htmlFor="reset-password-confirm">Confirm new password</label>
                <input
                  id="reset-password-confirm"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repeat new password"
                  required
                />
              </div>

              {saveStatus.message ? (
                <p className={`form-help ${saveStatus.type === "error" ? "error" : saveStatus.type === "success" ? "success" : ""}`}>
                  {saveStatus.message}
                </p>
              ) : null}

              <div className="account-create__actions">
                <button className="button primary" type="submit" disabled={saveStatus.type === "loading"}>
                  {saveStatus.type === "loading" ? "Saving..." : "Update Password"}
                </button>
              </div>
            </form>
          ) : null}
        </section>
      </div>
    </>
  );
}
