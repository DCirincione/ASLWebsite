"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";

type Status = { type: "idle" | "loading" | "success" | "error"; message?: string };

export default function ContactPage() {
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const [form, setForm] = useState({
    name: "",
    email: "",
    message: "",
  });

  const update = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const name = form.name.trim();
      const email = form.email.trim();
      const message = form.message.trim();
      if (!name || !email || !message) {
        setStatus({ type: "error", message: "Name, email, and message are required." });
        return;
      }

      setStatus({ type: "loading" });
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          message,
        }),
      });

      const json = (await response.json()) as { error?: string; message?: string; email_error?: string };

      if (!response.ok) {
        setStatus({ type: "error", message: json.error ?? json.message ?? "Could not send message." });
        return;
      }

      if (json.email_error) {
        setStatus({
          type: "error",
          message: json.email_error || json.message || "Message saved, but the email notification failed.",
        });
        return;
      }

      setStatus({ type: "success", message: json.message ?? "Message sent. We will get back to you soon." });
      setForm({ name: "", email: "", message: "" });
    } catch {
      setStatus({ type: "error", message: "Could not send message." });
    }
  };

  return (
    <PageShell>
      <Section
        id="contact-page"
        eyebrow="Contact"
        title="Contact Us"
        description="Have questions? Get in touch with ALDRICH SPORTS."
        headingLevel="h1"
      >
        <div className="contact-grid">
          <div className="contact-card">
            <h3>Send us a Message</h3>
            <form className="contact-form" onSubmit={handleSubmit}>
              <label className="form-control">
                <span>Name</span>
                <input
                  type="text"
                  name="name"
                  placeholder="Your name"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  required
                />
              </label>
              <label className="form-control">
                <span>Email</span>
                <input
                  type="email"
                  name="email"
                  placeholder="you@email.com"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  required
                />
              </label>
              <label className="form-control">
                <span>Message</span>
                <textarea
                  name="message"
                  rows={4}
                  placeholder="Your message"
                  value={form.message}
                  onChange={(e) => update("message", e.target.value)}
                  required
                />
              </label>
              <button className="button primary" type="submit" disabled={status.type === "loading"}>
                {status.type === "loading" ? "Sending..." : "Send Message"}
              </button>
              {status.message ? (
                <p className={`form-help ${status.type === "error" ? "error" : "muted"}`}>{status.message}</p>
              ) : null}
            </form>
          </div>

          <div className="contact-card contact-card--info">
            <h3>Get in Touch</h3>
            <div className="contact-list">
              <div className="contact-item">
                <span className="contact-icon">✉️</span>
                <div>
                  <p className="list__title">Email</p>
                  <p className="muted">joeandfrancismail@gmail.com</p>
                </div>
              </div>
              <div className="contact-item">
                <span className="contact-icon">📞</span>
                <div>
                  <p className="list__title">Phone</p>
                  <p className="muted">(631) 644-0871 / (631) 905-9595</p>
                </div>
              </div>
              <div className="contact-item">
                <span className="contact-icon">📍</span>
                <div>
                  <p className="list__title">Location</p>
                  <p className="muted">350 Aldrich Ln, Laurel, NY 11948</p>
                </div>
              </div>
            </div>
            <div className="contact-follow">
              <p className="list__title">Follow Us</p>
              <div className="contact-actions">
                <Link className="button ghost" href="https://www.instagram.com/aldrichsportsleague/" target="_blank">
                  Instagram
                </Link>
                <Link className="button ghost" href="https://www.facebook.com/profile.php?id=61558144266881" target="_blank">
                  Facebook
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="contact-map">
          <iframe
            title="Aldrich Sports Location"
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2995.296820938375!2d-72.5284931!3d40.961771699999996!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x89e89d7b33c8d80b%3A0x7f7f24f8206dfa8b!2s350%20Aldrich%20Ln%2C%20Laurel%2C%20NY%2011948!5e0!3m2!1sen!2sus!4v1735510000000!5m2!1sen!2sus"
            width="100%"
            height="360"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </Section>
    </PageShell>
  );
}
