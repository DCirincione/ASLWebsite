export const getPasswordResetRedirectUrl = () => {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/reset-password`;
  }

  return "https://aldrichsports.com/reset-password";
};

export const getPasswordResetErrorMessage = (message?: string) => {
  const trimmed = message?.trim();
  if (!trimmed) return "Could not send the password reset email.";

  if (trimmed.toLowerCase().includes("error sending recovery email")) {
    return "Could not send the recovery email. Check that the reset redirect URL is allowed in Supabase Auth and that email delivery is configured.";
  }

  return trimmed;
};
