"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";

type Status = { type: "idle" | "loading" | "success" | "error"; message?: string };

type AccountSignupFormProps = {
  onSuccess?: () => void;
};

export function AccountSignupForm({ onSuccess }: AccountSignupFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    age: "",
    positions: "",
    sports: "",
    skill_level: "",
    about: "",
  });

  const update = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const parseNumber = (value: string) => {
    const num = Number(value);
    return Number.isNaN(num) ? null : num;
  };

  const parseArray = (value: string) =>
    value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

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

    const { email, password, name, about } = form;
    const age = parseNumber(form.age);
    const skill_level = parseNumber(form.skill_level);
    const positions = parseArray(form.positions);
    const sports = parseArray(form.sports);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });

    if (error || !data.user) {
      setStatus({ type: "error", message: error?.message ?? "Unable to sign up. Check your inputs." });
      return;
    }

    const userId = data.user.id;
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: userId,
      name,
      age,
      positions,
      skill_level,
      sports,
      about,
    });

    if (profileError) {
      setStatus({ type: "error", message: profileError.message });
      return;
    }

    if (data.session) {
      setStatus({ type: "success", message: "Account created! Redirecting to your account..." });
      onSuccess?.();
      router.push("/account");
    } else {
      setStatus({
        type: "success",
        message: "Account created! Check your email to confirm, then sign in to continue.",
      });
    }
  };

  return (
    <form className="account-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="form-control">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            name="name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            required
          />
        </div>
        <div className="form-control">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            required
          />
        </div>
        <div className="form-control">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            required
          />
        </div>
        <div className="form-control">
          <label htmlFor="age">Age</label>
          <input
            id="age"
            name="age"
            value={form.age}
            onChange={(e) => update("age", e.target.value)}
            inputMode="numeric"
          />
        </div>
        <div className="form-control">
          <label htmlFor="skill_level">Skill (1-10)</label>
          <input
            id="skill_level"
            name="skill_level"
            value={form.skill_level}
            onChange={(e) => update("skill_level", e.target.value)}
            inputMode="numeric"
          />
        </div>
        <div className="form-control">
          <label htmlFor="positions">Positions</label>
          <input
            id="positions"
            name="positions"
            value={form.positions}
            onChange={(e) => update("positions", e.target.value)}
            placeholder="Forward, Wing"
          />
        </div>
        <div className="form-control">
          <label htmlFor="sports">Sports</label>
          <input
            id="sports"
            name="sports"
            value={form.sports}
            onChange={(e) => update("sports", e.target.value)}
            placeholder="Basketball, Flag Football"
          />
        </div>
      </div>
      <div className="form-control">
        <label htmlFor="about">About</label>
        <textarea
          id="about"
          name="about"
          value={form.about}
          onChange={(e) => update("about", e.target.value)}
          rows={3}
        />
      </div>
      {status.type === "error" ? <p className="form-help error">{status.message}</p> : null}
      {status.type === "success" ? <p className="form-help success">{status.message}</p> : null}
      <button className="button primary" type="submit" disabled={status.type === "loading"}>
        {status.type === "loading" ? "Creating..." : "Create Account"}
      </button>
    </form>
  );
}
