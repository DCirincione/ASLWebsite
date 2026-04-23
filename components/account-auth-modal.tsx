"use client";
import "@/app/account/account.css";

import { AccountSigninForm } from "./account-signin-form";
import { AccountSignupForm } from "./account-signup-form";

type AuthMode = "signup" | "signin";

type AccountAuthModalProps = {
  authMode: AuthMode;
  onAuthModeChange: (mode: AuthMode) => void;
  onClose: () => void;
  onSuccess?: () => void;
  redirectTo?: string | null;
  titleId?: string;
};

export function AccountAuthModal({
  authMode,
  onAuthModeChange,
  onClose,
  onSuccess,
  redirectTo,
  titleId = "account-auth-title",
}: AccountAuthModalProps) {
  const isSignup = authMode === "signup";

  return (
    <div className="account-create-modal">
      <button
        className="account-create__close"
        type="button"
        aria-label="Close create account dialog"
        onClick={onClose}
      >
        X
      </button>
      <header className="account-create__header">
        <div>
          <p className="eyebrow">Account</p>
          <h1 id={titleId}>{isSignup ? "Create an Account" : "Sign In"}</h1>
          <p className="muted">
            {isSignup
              ? "Set up your profile so you can register teams, track stats, and connect with friends."
              : "Sign in to access your account, manage teams, and track stats."}
          </p>
        </div>
        <div className="account-create__actions">
          <button
            className="button ghost"
            type="button"
            onClick={() => onAuthModeChange(isSignup ? "signin" : "signup")}
          >
            {isSignup ? "Already have an account? Sign in" : "New here? Create account"}
          </button>
          <button className="button ghost" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </header>
      {isSignup ? (
        <AccountSignupForm onSuccess={onSuccess} redirectTo={redirectTo} />
      ) : (
        <AccountSigninForm onSuccess={onSuccess} redirectTo={redirectTo} />
      )}
    </div>
  );
}
