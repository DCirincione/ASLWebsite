import type { Event } from "@/lib/supabase/types";

export type SignupMode = "registration" | "waitlist";

type EventSignupLike = Pick<Event, "signup_mode" | "registration_enabled">;

export const getSignupMode = (event?: EventSignupLike | null): SignupMode =>
  event?.signup_mode === "waitlist" ? "waitlist" : "registration";

export const isWaitlistEvent = (event?: EventSignupLike | null) => getSignupMode(event) === "waitlist";

export const getSignupActionLabel = (event?: EventSignupLike | null) =>
  isWaitlistEvent(event) ? "Join the Waitlist" : "Sign up";

export const getSignupSubmittedLabel = (event?: EventSignupLike | null) =>
  isWaitlistEvent(event) ? "Joined waitlist" : "Registered";

export const getSignupUnavailableLabel = (event?: EventSignupLike | null) =>
  isWaitlistEvent(event) ? "Waitlist not open yet" : "Registration coming soon";

export const getSignupUnavailableMessage = (event?: EventSignupLike | null) =>
  isWaitlistEvent(event) ? "The waitlist for this event is not open yet." : "Registration for this event is not available yet.";

export const getSignupModalEyebrow = (event?: EventSignupLike | null, mode: "create" | "edit" = "create") => {
  if (mode === "edit") {
    return isWaitlistEvent(event) ? "Edit Waitlist Entry" : "Edit Submission";
  }
  return isWaitlistEvent(event) ? "Join Waitlist" : "Register";
};

export const getSignupModalTitle = (event?: EventSignupLike | null) =>
  isWaitlistEvent(event) ? "Event waitlist" : "Event registration";

export const getSignupSuccessMessage = (event?: EventSignupLike | null, mode: "create" | "edit" = "create") => {
  if (mode === "edit") {
    return isWaitlistEvent(event) ? "Waitlist entry updated!" : "Submission updated!";
  }
  return isWaitlistEvent(event) ? "You joined the waitlist." : "Registration submitted!";
};

export const getSignupDuplicateMessage = (event?: EventSignupLike | null) =>
  isWaitlistEvent(event) ? "You are already on the waitlist for this event." : "You are already registered for this event.";
