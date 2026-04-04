import type { Event, Profile } from "@/lib/supabase/types";

export const EVENT_APPROVAL_STATUSES = ["approved", "pending_approval", "changes_requested"] as const;

export type EventApprovalStatus = (typeof EVENT_APPROVAL_STATUSES)[number];
export type ProfileRole = NonNullable<Profile["role"]>;

export const isEventApprovalStatus = (value: unknown): value is EventApprovalStatus =>
  typeof value === "string" && EVENT_APPROVAL_STATUSES.includes(value as EventApprovalStatus);

export const isPartnerRole = (role?: Profile["role"] | null) => role === "partner";

export const canAccessAdminDashboard = (role?: Profile["role"] | null) => role === "admin" || role === "owner";

export const canAccessPartnerPortal = (role?: Profile["role"] | null) =>
  role === "partner" || role === "admin" || role === "owner";

export const isPublicEventVisible = (event: Pick<Event, "host_type" | "approval_status">) =>
  event.host_type !== "partner" || event.approval_status === "approved";

export const filterVisiblePublicEvents = <T extends Pick<Event, "host_type" | "approval_status">>(events: T[]) =>
  events.filter(isPublicEventVisible);

export const formatApprovalStatusLabel = (status?: Event["approval_status"] | null) => {
  if (status === "approved") return "Approved";
  if (status === "changes_requested") return "Changes requested";
  return "Pending approval";
};

export const trimOptionalString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

export const parseOptionalInteger = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};

export const parseOptionalMoneyCents = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
};
