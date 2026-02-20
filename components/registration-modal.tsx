"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";

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

type Program = {
  id: string;
  name: string;
  slug: string;
  sport_slug?: string | null;
  waiver_url?: string | null;
};

type Status = { type: "idle" | "loading" | "success" | "error"; message?: string };

type RegistrationModalProps = {
  open: boolean;
  programSlug: string | null;
  contextTitle?: string;
  onClose: () => void;
  onSubmitted?: () => void;
};

export function RegistrationModal({ open, programSlug, contextTitle, onClose, onSubmitted }: RegistrationModalProps) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const [loadingProgram, setLoadingProgram] = useState(false);

  useEffect(() => {
    if (!open) return;
    const client = supabase;
    if (!client) return;
    client.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (!uid) {
        router.push("/account");
      }
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user.id ?? null;
      setUserId(uid);
      if (!uid) {
        router.push("/account");
      }
    });
    return () => sub?.subscription.unsubscribe();
  }, [open, router]);

  useEffect(() => {
    if (!open || !programSlug || !supabase) return;
    const load = async () => {
      setLoadingProgram(true);
      setStatus({ type: "idle" });
      setProgram(null);
      setFields([]);
      setValues({});
      setFiles({});

      const { data: programRow, error: programError } = await supabase
        .from("registration_programs")
        .select("id,slug,name,sport_slug,waiver_url")
        .eq("slug", programSlug)
        .eq("active", true)
        .maybeSingle();

      if (programError || !programRow) {
        setStatus({ type: "error", message: "Registration not available for this event." });
        setLoadingProgram(false);
        return;
      }

      const { data: fieldRows, error: fieldError } = await supabase
        .from("registration_fields")
        .select("id,label,name,type,required,options,placeholder,help,order")
        .eq("program_id", programRow.id)
        .order("order", { ascending: true });

      if (fieldError || !fieldRows) {
        setStatus({ type: "error", message: "Unable to load fields for this registration." });
        setLoadingProgram(false);
        return;
      }

      setProgram(programRow as Program);
      const normalized = (fieldRows as any[]).map((f) => ({
        id: f.id,
        label: f.label,
        name: f.name,
        type: f.type,
        required: f.required,
        options: f.options ?? [],
        placeholder: f.placeholder,
        help: f.help,
      })) as Field[];
      setFields(normalized);

      const defaults: Record<string, any> = {};
      for (const field of normalized) {
        defaults[field.name] = field.type === "checkbox" ? false : "";
      }
      setValues(defaults);
      setLoadingProgram(false);
    };
    load();
  }, [open, programSlug]);

  const updateValue = (name: string, value: any) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const updateFiles = (name: string, list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => ({ ...prev, [name]: Array.from(list) }));
  };

  const validate = useMemo(() => {
    return () => {
      for (const field of fields) {
        if (!field.required) continue;
        if (field.type === "file") {
          if (!files[field.name]?.length) return `${field.label} is required.`;
        } else if (field.type === "checkbox") {
          if (!values[field.name]) return `${field.label} is required.`;
        } else if (!values[field.name]) {
          return `${field.label} is required.`;
        }
      }
      return null;
    };
  }, [fields, files, values]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setStatus({ type: "error", message: "Supabase is not configured." });
      return;
    }
    if (!userId) {
      router.push("/account");
      return;
    }
    if (!program) return;

    const validationMessage = validate();
    if (validationMessage) {
      setStatus({ type: "error", message: validationMessage });
      return;
    }

    setStatus({ type: "loading" });
    const answers: Record<string, any> = {};
    const attachments: string[] = [];

    for (const field of fields) {
      if (field.type === "file") continue;
      answers[field.name] = values[field.name] ?? "";
    }

    for (const [fieldName, fileList] of Object.entries(files)) {
      if (!fileList?.length) continue;
      const storedPaths: string[] = [];
      for (const file of fileList) {
        const path = `${program.slug}/${crypto.randomUUID()}-${file.name}`;
        const { data, error } = await supabase.storage.from("signups").upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });
        if (error) {
          setStatus({ type: "error", message: `Upload failed: ${error.message}` });
          return;
        }
        const finalPath = data?.path ?? path;
        storedPaths.push(finalPath);
        attachments.push(finalPath);
      }
      answers[fieldName] = storedPaths.length === 1 ? storedPaths[0] : storedPaths;
    }

    const { error } = await supabase.from("registration_submissions").insert({
      program_id: program.id,
      sport_slug: program.sport_slug,
      user_id: userId,
      answers,
      attachments,
      waiver_accepted: Boolean(values.waiver_accepted),
      referral_source: values.referral_source ?? answers.referral_source ?? "",
    });

    if (error) {
      setStatus({ type: "error", message: error.message ?? "Could not submit registration." });
      return;
    }

    setStatus({ type: "success", message: "Registration submitted!" });
    onSubmitted?.();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="register-modal-backdrop" role="dialog" aria-modal="true">
      <div className="register-modal">
        <div className="register-modal__header">
          <div>
            <p className="eyebrow">Register</p>
            <h2>{program?.name || contextTitle || "Event registration"}</h2>
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

        {loadingProgram ? <p className="muted">Loading form…</p> : null}
        {status.type === "error" ? (
          <p className="form-help error" role="status" aria-live="polite">
            {status.message}
          </p>
        ) : null}

        {!loadingProgram && program && fields.length > 0 ? (
          <form className="register-form" onSubmit={handleSubmit}>
            <div className="register-form-grid">
              {fields.map((field) => {
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
                    <div className="form-control checkbox-control" key={field.id}>
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
                    <div className="form-control" key={field.id}>
                      <label htmlFor={id}>{label}</label>
                      <input
                        id={id}
                        name={field.name}
                        type="file"
                        required={field.required}
                        multiple
                        onChange={(e) => updateFiles(field.name, e.target.files)}
                      />
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
            </div>
            <div className="register-modal__footer">
              <div className="register-footer__left">
                {program.waiver_url ? (
                  <Link className="muted" href={program.waiver_url} target="_blank">
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
                  {status.type === "loading" ? "Submitting..." : "Submit registration"}
                </button>
              </div>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
