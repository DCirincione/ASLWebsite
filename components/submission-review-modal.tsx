"use client";

import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase/client";
import type { JsonValue } from "@/lib/supabase/types";

type SubmissionReview = {
  eventTitle: string;
  submittedAt?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  paymentSummary?: string | null;
  answers?: Record<string, JsonValue | undefined> | null;
  attachments?: string[] | null;
  waiverAccepted?: boolean | null;
};

type SubmissionReviewModalProps = {
  open: boolean;
  submission: SubmissionReview | null;
  onEdit?: () => void;
  onClose: () => void;
};

type ResolvedAttachment = {
  path: string;
  filename: string;
  url: string | null;
};

const formatSubmittedAt = (value?: string | null) => {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const labelFromKey = (key: string) =>
  key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatAnswerValue = (value: JsonValue | undefined): string => {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim() || "—";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.map((entry) => formatAnswerValue(entry)).join(", ");
  }
  return JSON.stringify(value, null, 2);
};

const filenameFromPath = (path: string) => {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
};

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

export function SubmissionReviewModal({ open, submission, onEdit, onClose }: SubmissionReviewModalProps) {
  const [resolvedAttachments, setResolvedAttachments] = useState<ResolvedAttachment[]>([]);
  const [resolvedAttachmentsKey, setResolvedAttachmentsKey] = useState("");
  const attachmentPaths = useMemo(() => submission?.attachments ?? [], [submission?.attachments]);
  const attachmentKey = open ? attachmentPaths.join("|") : "";

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || attachmentPaths.length === 0 || !supabase) {
      return;
    }
    const client = supabase;

    let cancelled = false;
    const loadAttachments = async () => {
      const resolved = await Promise.all(
        attachmentPaths.map(async (path) => {
          if (isAbsoluteUrl(path)) {
            return {
              path,
              filename: filenameFromPath(path),
              url: path,
            };
          }

          const { data, error } = await client.storage.from("signups").createSignedUrl(path, 60 * 60);
          return {
            path,
            filename: filenameFromPath(path),
            url: error ? null : data?.signedUrl ?? null,
          };
        })
      );

      if (cancelled) return;
      setResolvedAttachments(resolved);
      setResolvedAttachmentsKey(attachmentKey);
    };

    void loadAttachments();
    return () => {
      cancelled = true;
    };
  }, [attachmentKey, attachmentPaths, open]);

  if (!open || !submission) return null;

  const answerEntries = Object.entries(submission.answers ?? {}).filter(([, value]) => value !== undefined);
  const visibleResolvedAttachments =
    attachmentPaths.length === 0
      ? []
      : !supabase
        ? attachmentPaths.map((path) => ({
            path,
            filename: filenameFromPath(path),
            url: isAbsoluteUrl(path) ? path : null,
          }))
        : resolvedAttachmentsKey === attachmentKey
          ? resolvedAttachments
          : [];
  const showAttachmentLoading = Boolean(supabase) && attachmentPaths.length > 0 && resolvedAttachmentsKey !== attachmentKey;

  return (
    <div
      className="event-detail-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Submission for ${submission.eventTitle}`}
      onClick={onClose}
    >
      <div className="event-detail submission-review" onClick={(event) => event.stopPropagation()}>
        <div className="event-detail__header">
          <div>
            <p className="eyebrow">My Submission</p>
            <h2>{submission.eventTitle}</h2>
            <p className="muted">Submitted {formatSubmittedAt(submission.submittedAt)}</p>
          </div>
          <div className="event-detail__header-actions">
            {onEdit ? (
              <button className="button primary" type="button" onClick={onEdit}>
                Edit Submission
              </button>
            ) : null}
            <button className="button ghost" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="event-detail__meta">
          <span className="pill pill--muted">{submission.name}</span>
          <span className="pill pill--muted">{submission.email}</span>
          {submission.phone ? <span className="pill pill--muted">{submission.phone}</span> : null}
          {submission.paymentSummary ? <span className="pill pill--muted">{submission.paymentSummary}</span> : null}
          <span className="pill pill--muted">Waiver: {submission.waiverAccepted ? "Accepted" : "Not required"}</span>
        </div>

        <div className="submission-review__layout">
          <section className="event-detail__info">
            <h3>Submitted Answers</h3>
            {answerEntries.length === 0 ? (
              <p className="muted">No custom answers were saved for this registration.</p>
            ) : (
              <div className="submission-review__list">
                {answerEntries.map(([key, value]) => {
                  const formatted = formatAnswerValue(value);
                  const multiline = formatted.includes("\n");
                  return (
                    <div key={key} className="submission-review__row">
                      <p className="submission-review__label">{labelFromKey(key)}</p>
                      {multiline ? (
                        <pre className="submission-review__value submission-review__value--pre">{formatted}</pre>
                      ) : (
                        <p className="submission-review__value">{formatted}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="event-detail__list">
            <h4>Attachments</h4>
            {showAttachmentLoading ? (
              <p className="muted">Loading attachments...</p>
            ) : visibleResolvedAttachments.length > 0 ? (
              <ul className="submission-review__attachments">
                {visibleResolvedAttachments.map((attachment) => (
                  <li key={attachment.path} className="submission-review__attachment-item">
                    <span>{attachment.filename}</span>
                    <div className="submission-review__attachment-actions">
                      {attachment.url ? (
                        <>
                          <a
                            className="button ghost"
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Preview
                          </a>
                          <a
                            className="button ghost"
                            href={attachment.url}
                            download={attachment.filename}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Download
                          </a>
                        </>
                      ) : (
                        <span className="muted">Unavailable</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No files were attached.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
