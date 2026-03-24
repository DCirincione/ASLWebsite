"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createId } from "@/lib/create-id";
import { supabase } from "@/lib/supabase/client";
import type { JsonValue } from "@/lib/supabase/types";

type FieldType = "text" | "email" | "tel" | "number" | "select" | "textarea" | "checkbox" | "file";

type Field = {
  id: string;
  label: string;
  name: string;
  type: FieldType;
  required: boolean;
  options: string[];
  placeholder?: string | null;
  help?: string | null;
};

type RegistrationSchema = {
  fields?: unknown;
  require_waiver?: boolean;
};

type EventRegistration = {
  id: string;
  title: string;
  registration_enabled?: boolean | null;
  registration_schema?: JsonValue | null;
  waiver_url?: string | null;
  allow_multiple_registrations?: boolean | null;
  registration_limit?: number | null;
};

type Status = { type: "idle" | "loading" | "success" | "error"; message?: string };

type RegistrationModalProps = {
  open: boolean;
  eventId: string | null;
  contextTitle?: string;
  mode?: "create" | "edit";
  submissionId?: string | null;
  initialSubmission?: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    answers?: Record<string, JsonValue | undefined> | null;
    attachments?: string[] | null;
    waiver_accepted?: boolean | null;
  } | null;
  onClose: () => void;
  onSubmitted?: () => void;
};

const DEFAULT_VALUES = {
  name: "",
  email: "",
  phone: "",
  waiver_accepted: false,
};

const isFieldType = (value: unknown): value is FieldType =>
  value === "text" ||
  value === "email" ||
  value === "tel" ||
  value === "number" ||
  value === "select" ||
  value === "textarea" ||
  value === "checkbox" ||
  value === "file";

const parseSchemaFields = (schema: JsonValue | null | undefined): Field[] => {
  const rawSchema = (schema ?? null) as RegistrationSchema | null;
  const rawFields = Array.isArray(rawSchema?.fields) ? rawSchema?.fields : Array.isArray(schema) ? schema : [];
  return rawFields.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const field = entry as Record<string, unknown>;
    const name = typeof field.name === "string" ? field.name.trim() : "";
    const label = typeof field.label === "string" ? field.label.trim() : "";
    const type = isFieldType(field.type) ? field.type : "text";
    if (!name || !label) return [];
    return [
      {
        id: typeof field.id === "string" ? field.id : `${name}-${index}`,
        name,
        label,
        type,
        required: Boolean(field.required),
        options: Array.isArray(field.options) ? field.options.filter((opt): opt is string => typeof opt === "string") : [],
        placeholder: typeof field.placeholder === "string" ? field.placeholder : null,
        help: typeof field.help === "string" ? field.help : null,
      },
    ];
  });
};

const schemaRequiresWaiver = (schema: JsonValue | null | undefined) => {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return false;
  return Boolean((schema as RegistrationSchema).require_waiver);
};

export function RegistrationModal({
  open,
  eventId,
  contextTitle,
  mode = "create",
  submissionId = null,
  initialSubmission = null,
  onClose,
  onSubmitted,
}: RegistrationModalProps) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [eventConfig, setEventConfig] = useState<EventRegistration | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [values, setValues] = useState<Record<string, any>>(DEFAULT_VALUES);
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const [loadingEvent, setLoadingEvent] = useState(false);

  useEffect(() => {
    if (!open) return;
    const client = supabase;
    if (!client) return;
    client.auth.getSession().then(({ data }) => {
      const session = data.session;
      const uid = session?.user.id ?? null;
      setUserId(uid);
      setValues((prev) => ({
        ...prev,
        email: prev.email || session?.user.email || "",
      }));
      if (!uid) {
        router.push("/account");
      }
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user.id ?? null;
      setUserId(uid);
      setValues((prev) => ({
        ...prev,
        email: prev.email || session?.user.email || "",
      }));
      if (!uid) {
        router.push("/account");
      }
    });
    return () => sub?.subscription.unsubscribe();
  }, [open, router]);

  useEffect(() => {
    if (!open || !eventId) return;
    const client = supabase;
    if (!client) return;
    const load = async () => {
      setLoadingEvent(true);
      setStatus({ type: "idle" });
      setEventConfig(null);
      setFields([]);
      setValues((prev) => ({ ...DEFAULT_VALUES, email: prev.email || "" }));
      setFiles({});

      const { data: eventRow, error: eventError } = await client
        .from("events")
        .select("id,title,registration_enabled,registration_schema,waiver_url,allow_multiple_registrations,registration_limit")
        .eq("id", eventId)
        .maybeSingle();

      if (eventError || !eventRow) {
        setStatus({ type: "error", message: "Registration not available for this event." });
        setLoadingEvent(false);
        return;
      }

      if (!eventRow.registration_enabled) {
        setStatus({ type: "error", message: "Registration is not enabled for this event." });
        setLoadingEvent(false);
        return;
      }

      const normalized = parseSchemaFields(eventRow.registration_schema ?? null);
      setEventConfig(eventRow as EventRegistration);
      setFields(normalized);
      setValues((prev) => {
        const nextValues: Record<string, any> = {
          ...DEFAULT_VALUES,
          email: initialSubmission?.email ?? (prev.email || ""),
          name: initialSubmission?.name ?? (prev.name || ""),
          phone: initialSubmission?.phone ?? (prev.phone || ""),
          waiver_accepted: Boolean(initialSubmission?.waiver_accepted),
        };
        for (const field of normalized) {
          const savedValue = initialSubmission?.answers?.[field.name];
          if (savedValue !== undefined) {
            nextValues[field.name] = field.type === "checkbox" ? Boolean(savedValue) : savedValue;
          } else {
            nextValues[field.name] = field.type === "checkbox" ? false : "";
          }
        }
        return nextValues;
      });
      setLoadingEvent(false);
    };
    void load();
  }, [open, eventId, initialSubmission]);

  const updateValue = (name: string, value: any) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const updateFiles = (name: string, list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => ({ ...prev, [name]: Array.from(list) }));
  };

  const waiverRequired = Boolean(eventConfig?.waiver_url || schemaRequiresWaiver(eventConfig?.registration_schema));

  const validate = useMemo(() => {
    return () => {
      if (!values.name?.trim()) return "Name is required.";
      if (!values.email?.trim()) return "Email is required.";
      for (const field of fields) {
        if (!field.required) continue;
        if (field.type === "file") {
          const existingValue = values[field.name];
          const hasExistingFile =
            (typeof existingValue === "string" && existingValue.trim().length > 0) ||
            (Array.isArray(existingValue) && existingValue.length > 0);
          if (!files[field.name]?.length && !hasExistingFile) return `${field.label} is required.`;
        } else if (field.type === "checkbox") {
          if (!values[field.name]) return `${field.label} is required.`;
        } else if (!String(values[field.name] ?? "").trim()) {
          return `${field.label} is required.`;
        }
      }
      if (waiverRequired && !values.waiver_accepted) return "You must accept the waiver to continue.";
      return null;
    };
  }, [fields, files, values, waiverRequired]);

  const orderedFields = useMemo(() => {
    const primary = fields.filter((field) => field.type !== "checkbox" && field.type !== "file");
    const trailing = fields.filter((field) => field.type === "file" || field.type === "checkbox");
    return [...primary, ...trailing];
  }, [fields]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client) {
      setStatus({ type: "error", message: "Supabase is not configured." });
      return;
    }
    if (!userId) {
      router.push("/account");
      return;
    }
    if (!eventConfig) return;

    const validationMessage = validate();
    if (validationMessage) {
      setStatus({ type: "error", message: validationMessage });
      return;
    }

    if (mode === "create" && !eventConfig.allow_multiple_registrations) {
      const { data: existing, error: existingError } = await client
        .from("event_submissions")
        .select("id")
        .eq("event_id", eventConfig.id)
        .eq("user_id", userId)
        .limit(1);

      if (existingError) {
        setStatus({ type: "error", message: existingError.message ?? "Could not verify registration status." });
        return;
      }

      if ((existing ?? []).length > 0) {
        setStatus({ type: "error", message: "You are already registered for this event." });
        onSubmitted?.();
        return;
      }
    }

    if (mode === "create" && eventConfig.registration_limit && eventConfig.registration_limit > 0) {
      const { count, error: countError } = await client
        .from("event_submissions")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventConfig.id);

      if (countError) {
        setStatus({ type: "error", message: countError.message ?? "Could not verify registration capacity." });
        return;
      }

      if ((count ?? 0) >= eventConfig.registration_limit) {
        setStatus({ type: "error", message: "Registration is full for this event." });
        return;
      }
    }

    setStatus({ type: "loading" });
    const answers: Record<string, JsonValue> = {};
    for (const field of fields) {
      if (field.type === "file") {
        const existingValue = values[field.name];
        if (existingValue !== undefined && existingValue !== null && existingValue !== "") {
          answers[field.name] = existingValue as JsonValue;
        }
        continue;
      }
      answers[field.name] = (values[field.name] ?? "") as JsonValue;
    }

    for (const [fieldName, fileList] of Object.entries(files)) {
      if (!fileList?.length) continue;
      const storedPaths: string[] = [];
      for (const file of fileList) {
        const path = `${eventConfig.id}/${createId()}-${file.name}`;
        const { data, error } = await client.storage.from("signups").upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });
        if (error) {
          setStatus({ type: "error", message: `Upload failed: ${error.message}` });
          return;
        }
        const finalPath = data?.path ?? path;
        storedPaths.push(finalPath);
      }
      answers[fieldName] = (storedPaths.length === 1 ? storedPaths[0] : storedPaths) as JsonValue;
    }

    const attachments = fields
      .filter((field) => field.type === "file")
      .flatMap((field) => {
        const value = answers[field.name];
        if (typeof value === "string" && value.trim()) return [value];
        if (Array.isArray(value)) {
          return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
        }
        return [];
      });

    const payload = {
      event_id: eventConfig.id,
      user_id: userId,
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone?.trim() || null,
      answers,
      attachments,
      waiver_accepted: Boolean(values.waiver_accepted),
      waiver_accepted_at: values.waiver_accepted ? new Date().toISOString() : null,
    };

    const { error } =
      mode === "edit" && submissionId
        ? await client.from("event_submissions").update(payload).eq("id", submissionId).eq("user_id", userId)
        : await client.from("event_submissions").insert(payload);

    if (error) {
      setStatus({ type: "error", message: error.message ?? `Could not ${mode === "edit" ? "update" : "submit"} registration.` });
      return;
    }

    setStatus({ type: "success", message: mode === "edit" ? "Submission updated!" : "Registration submitted!" });
    onSubmitted?.();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="register-modal-backdrop" role="dialog" aria-modal="true">
      <div className="register-modal">
        <div className="register-modal__header">
          <div>
            <p className="eyebrow">{mode === "edit" ? "Edit Submission" : "Register"}</p>
            <h2>{eventConfig?.title || contextTitle || "Event registration"}</h2>
            {contextTitle ? <p className="muted">{contextTitle}</p> : null}
          </div>
          <button className="button ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="register-modal__meta">
          <span className="pill pill--muted">Secure form</span>
          <span className="muted">All required fields are marked with *</span>
        </div>

        {loadingEvent ? <p className="muted">Loading form…</p> : null}
        {status.type === "error" ? (
          <p className="form-help error" role="status" aria-live="polite">
            {status.message}
          </p>
        ) : null}

        {!loadingEvent && eventConfig ? (
          <form className="register-form" onSubmit={handleSubmit}>
            <div className="register-form-grid">
              <div className="form-control">
                <label htmlFor="field-name">
                  <span className="register-field-label">
                    Name
                    <span className="register-required">*</span>
                  </span>
                </label>
                <input
                  id="field-name"
                  name="name"
                  required
                  value={values.name || ""}
                  onChange={(e) => updateValue("name", e.target.value)}
                />
              </div>
              <div className="form-control">
                <label htmlFor="field-email">
                  <span className="register-field-label">
                    Email
                    <span className="register-required">*</span>
                  </span>
                </label>
                <input
                  id="field-email"
                  name="email"
                  type="email"
                  required
                  value={values.email || ""}
                  onChange={(e) => updateValue("email", e.target.value)}
                />
              </div>
              <div className="form-control">
                <label htmlFor="field-phone">
                  <span className="register-field-label">Phone</span>
                </label>
                <input
                  id="field-phone"
                  name="phone"
                  type="tel"
                  value={values.phone || ""}
                  onChange={(e) => updateValue("phone", e.target.value)}
                />
              </div>

              {orderedFields.map((field) => {
                const value = values[field.name] ?? (field.type === "checkbox" ? false : "");
                const id = `field-${field.id}`;
                const label = (
                  <span className="register-field-label">
                    {field.label}
                    {field.required ? <span className="register-required">*</span> : null}
                  </span>
                );

                if (field.type === "select") {
                  return (
                    <div className="form-control" key={field.id}>
                      <label htmlFor={id}>{label}</label>
                      <select
                        id={id}
                        name={field.name}
                        required={field.required}
                        value={value || ""}
                        onChange={(e) => updateValue(field.name, e.target.value)}
                      >
                        <option value="">Select</option>
                        {field.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      {field.help ? <p className="form-help muted">{field.help}</p> : null}
                    </div>
                  );
                }

                if (field.type === "textarea") {
                  return (
                    <div className="form-control" key={field.id}>
                      <label htmlFor={id}>{label}</label>
                      <textarea
                        id={id}
                        name={field.name}
                        required={field.required}
                        value={value || ""}
                        placeholder={field.placeholder ?? undefined}
                        onChange={(e) => updateValue(field.name, e.target.value)}
                        rows={3}
                      />
                      {field.help ? <p className="form-help muted">{field.help}</p> : null}
                    </div>
                  );
                }

                if (field.type === "checkbox") {
                  return (
                    <div className="form-control checkbox-control register-form-control--end" key={field.id}>
                      <label className="checkbox-label">
                        <input
                          id={id}
                          name={field.name}
                          type="checkbox"
                          checked={Boolean(value)}
                          required={field.required}
                          onChange={(e) => updateValue(field.name, e.target.checked)}
                        />
                        <span>
                          {field.label}
                          {field.required ? <span className="register-required">*</span> : null}
                        </span>
                      </label>
                      {field.help ? <p className="form-help muted">{field.help}</p> : null}
                    </div>
                  );
                }

                if (field.type === "file") {
                  return (
                    <div className="form-control register-form-control--end" key={field.id}>
                      <label htmlFor={id}>{label}</label>
                      <input
                        id={id}
                        name={field.name}
                        type="file"
                        required={field.required && !values[field.name]}
                        multiple
                        onChange={(e) => updateFiles(field.name, e.target.files)}
                      />
                      {values[field.name] ? (
                        <p className="form-help muted">
                          Current file{Array.isArray(values[field.name]) && values[field.name].length !== 1 ? "s" : ""}:{" "}
                          {Array.isArray(values[field.name])
                            ? values[field.name]
                                .filter((entry: unknown): entry is string => typeof entry === "string")
                                .map((entry: string) => entry.split("/").pop() || entry)
                                .join(", ")
                            : typeof values[field.name] === "string"
                              ? values[field.name].split("/").pop() || values[field.name]
                              : ""}
                        </p>
                      ) : null}
                      {field.help ? <p className="form-help muted">{field.help}</p> : null}
                    </div>
                  );
                }

                return (
                  <div className="form-control" key={field.id}>
                    <label htmlFor={id}>{label}</label>
                    <input
                      id={id}
                      name={field.name}
                      type={field.type}
                      required={field.required}
                      value={value || ""}
                      placeholder={field.placeholder ?? undefined}
                      onChange={(e) => updateValue(field.name, e.target.value)}
                    />
                    {field.help ? <p className="form-help muted">{field.help}</p> : null}
                  </div>
                );
              })}

              {waiverRequired ? (
                <div className="form-control checkbox-control register-form-control--end">
                  <label className="checkbox-label">
                    <input
                      id="field-waiver-accepted"
                      name="waiver_accepted"
                      type="checkbox"
                      checked={Boolean(values.waiver_accepted)}
                      onChange={(e) => updateValue("waiver_accepted", e.target.checked)}
                    />
                    <span>
                      I accept the waiver
                      <span className="register-required">*</span>
                    </span>
                  </label>
                </div>
              ) : null}
            </div>
            <div className="register-modal__footer">
              <div className="register-footer__left">
                {eventConfig.waiver_url ? (
                  <Link className="muted" href={eventConfig.waiver_url} target="_blank">
                    View waiver
                  </Link>
                ) : null}
                {status.type === "success" ? (
                  <p className="form-help success" role="status" aria-live="polite">
                    {status.message}
                  </p>
                ) : null}
              </div>
              <div className="register-footer__actions">
                <button className="button ghost" type="button" onClick={onClose}>
                  Cancel
                </button>
                <button className="button primary" type="submit" disabled={status.type === "loading"}>
                  {status.type === "loading"
                    ? mode === "edit"
                      ? "Saving..."
                      : "Submitting..."
                    : mode === "edit"
                      ? "Save changes"
                      : "Submit registration"}
                </button>
              </div>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
