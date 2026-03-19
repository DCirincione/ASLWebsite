"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { AccessibilityControls } from "@/components/accessibility-controls";
import { supabase } from "@/lib/supabase/client";

type SettingsFormState = {
  display_name: string;
  sports: string;
  about: string;
  email: string;
  birthday: string;
  new_password: string;
  confirm_password: string;
  profile_visibility: "public" | "members" | "private";
  friend_request_access: "everyone" | "players" | "none";
  email_event_updates: boolean;
  email_friend_requests: boolean;
  email_community_updates: boolean;
};

type SaveStatus = { type: "idle" | "loading" | "success" | "error"; message?: string };

const emptySettingsForm: SettingsFormState = {
  display_name: "",
  sports: "",
  about: "",
  email: "",
  birthday: "",
  new_password: "",
  confirm_password: "",
  profile_visibility: "members",
  friend_request_access: "everyone",
  email_event_updates: true,
  email_friend_requests: true,
  email_community_updates: false,
};

export default function AccountSettingsPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "no-session">("loading");
  const [settingsForm, setSettingsForm] = useState<SettingsFormState>(emptySettingsForm);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ type: "idle" });
  const [currentEmail, setCurrentEmail] = useState("");

  useEffect(() => {
    const loadSettings = async () => {
      if (!supabase) {
        setStatus("error");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user ?? null;

      if (!user) {
        setStatus("no-session");
        return;
      }

      const rawSettings = user.user_metadata?.settings as Partial<SettingsFormState> | undefined;
      const { data: profile } = await supabase
        .from("profiles")
        .select("name,age,sports,about")
        .eq("id", user.id)
        .maybeSingle();

      const nextForm: SettingsFormState = {
        ...emptySettingsForm,
        display_name: profile?.name ?? "",
        sports: Array.isArray(profile?.sports) ? profile.sports.join(", ") : "",
        about: profile?.about ?? "",
        email: user.email ?? "",
        birthday: profile?.age ?? "",
        profile_visibility:
          rawSettings?.profile_visibility === "public" ||
          rawSettings?.profile_visibility === "members" ||
          rawSettings?.profile_visibility === "private"
            ? rawSettings.profile_visibility
            : emptySettingsForm.profile_visibility,
        friend_request_access:
          rawSettings?.friend_request_access === "everyone" ||
          rawSettings?.friend_request_access === "players" ||
          rawSettings?.friend_request_access === "none"
            ? rawSettings.friend_request_access
            : emptySettingsForm.friend_request_access,
        email_event_updates:
          typeof rawSettings?.email_event_updates === "boolean"
            ? rawSettings.email_event_updates
            : emptySettingsForm.email_event_updates,
        email_friend_requests:
          typeof rawSettings?.email_friend_requests === "boolean"
            ? rawSettings.email_friend_requests
            : emptySettingsForm.email_friend_requests,
        email_community_updates:
          typeof rawSettings?.email_community_updates === "boolean"
            ? rawSettings.email_community_updates
            : emptySettingsForm.email_community_updates,
      };

      setCurrentEmail(user.email ?? "");
      setSettingsForm(nextForm);
      setStatus("ready");
    };

    void loadSettings();
  }, []);

  const updateSettingsForm = <K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) => {
    setSettingsForm((prev) => ({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    if (!supabase) {
      setSaveStatus({ type: "error", message: "Supabase is not configured." });
      return;
    }

    const email = settingsForm.email.trim();
    if (!email) {
      setSaveStatus({ type: "error", message: "Email is required." });
      return;
    }

    if (settingsForm.new_password && settingsForm.new_password.length < 8) {
      setSaveStatus({ type: "error", message: "New password must be at least 8 characters." });
      return;
    }

    if (settingsForm.new_password !== settingsForm.confirm_password) {
      setSaveStatus({ type: "error", message: "Password confirmation does not match." });
      return;
    }

    setSaveStatus({ type: "loading" });

    const profilePayload = {
      name: settingsForm.display_name.trim() || "Player",
      age: settingsForm.birthday.trim() || null,
      sports: settingsForm.sports
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
      about: settingsForm.about.trim() || null,
    };

    const { error: profileError } = await supabase
      .from("profiles")
      .update(profilePayload)
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "");

    if (profileError) {
      setSaveStatus({ type: "error", message: profileError.message });
      return;
    }

    const settingsMetadata = {
      profile_visibility: settingsForm.profile_visibility,
      friend_request_access: settingsForm.friend_request_access,
      email_event_updates: settingsForm.email_event_updates,
      email_friend_requests: settingsForm.email_friend_requests,
      email_community_updates: settingsForm.email_community_updates,
    };

    const payload: {
      email?: string;
      password?: string;
      data: { settings: typeof settingsMetadata };
    } = {
      data: { settings: settingsMetadata },
    };

    if (email !== currentEmail) {
      payload.email = email;
    }

    if (settingsForm.new_password) {
      payload.password = settingsForm.new_password;
    }

    const { data, error } = await supabase.auth.updateUser(payload);

    if (error) {
      setSaveStatus({ type: "error", message: error.message });
      return;
    }

    const updatedEmail = data.user?.email ?? payload.email ?? currentEmail;
    setCurrentEmail(updatedEmail);
    setSettingsForm((prev) => ({
      ...prev,
      display_name: profilePayload.name,
      sports: profilePayload.sports.join(", "),
      about: profilePayload.about ?? "",
      email: updatedEmail,
      new_password: "",
      confirm_password: "",
    }));
    setSaveStatus({
      type: "success",
      message:
        payload.email && payload.email !== currentEmail
          ? "Settings saved. Check your email to confirm the new address."
          : "Settings saved.",
    });
  };

  return (
    <>
      <AccessibilityControls />
      <div className="account-body shell">
        <Link className="button ghost" href="/account">
          ← Back
        </Link>

        {status === "loading" ? (
          <section className="account-card">
            <p className="muted">Loading your settings...</p>
          </section>
        ) : status === "no-session" ? (
          <section className="account-card">
            <p className="muted">Sign in to manage your settings.</p>
          </section>
        ) : status === "error" ? (
          <section className="account-card">
            <p className="form-help error">Could not load settings.</p>
          </section>
        ) : (
          <form
            className="settings-layout"
            onSubmit={(event) => {
              event.preventDefault();
              void saveSettings();
            }}
          >
            <section className="account-card">
              <div className="account-card__header">
                <div>
                  <h2>Profile Information</h2>
                  <p className="muted">Update the profile details other users see alongside your visibility settings.</p>
                </div>
              </div>
              <div className="account-form" style={{ borderTop: "none", paddingTop: 0 }}>
                <div className="form-grid">
                  <div className="form-control">
                    <label htmlFor="settings-display-name">Display name</label>
                    <input
                      id="settings-display-name"
                      value={settingsForm.display_name}
                      onChange={(event) => updateSettingsForm("display_name", event.target.value)}
                      required
                    />
                  </div>
                  <div className="form-control">
                    <label htmlFor="settings-sports">Sports</label>
                    <input
                      id="settings-sports"
                      value={settingsForm.sports}
                      onChange={(event) => updateSettingsForm("sports", event.target.value)}
                      placeholder="Basketball, Flag Football"
                    />
                  </div>
                  <div className="form-control">
                    <label htmlFor="settings-profile-visibility">Profile visibility</label>
                    <select
                      id="settings-profile-visibility"
                      value={settingsForm.profile_visibility}
                      onChange={(event) => updateSettingsForm("profile_visibility", event.target.value as SettingsFormState["profile_visibility"])}
                    >
                      <option value="public">Public</option>
                      <option value="members">Members only</option>
                      <option value="private">Private</option>
                    </select>
                  </div>
                  <div className="form-control">
                    <label htmlFor="settings-friend-requests">Who can send friend requests</label>
                    <select
                      id="settings-friend-requests"
                      value={settingsForm.friend_request_access}
                      onChange={(event) => updateSettingsForm("friend_request_access", event.target.value as SettingsFormState["friend_request_access"])}
                    >
                      <option value="everyone">Everyone</option>
                      <option value="players">Players only</option>
                      <option value="none">No one</option>
                    </select>
                  </div>
                </div>
                <div className="form-control">
                  <label htmlFor="settings-about">Bio</label>
                  <textarea
                    id="settings-about"
                    value={settingsForm.about}
                    onChange={(event) => updateSettingsForm("about", event.target.value)}
                    rows={4}
                  />
                </div>
              </div>
            </section>

            <section className="account-card">
              <div className="account-card__header">
                <div>
                  <h2>Account & Security</h2>
                  <p className="muted">Manage your login email and password.</p>
                </div>
              </div>
              <div className="account-form" style={{ borderTop: "none", paddingTop: 0 }}>
                <div className="form-grid">
                  <div className="form-control">
                    <label htmlFor="settings-email">Email</label>
                    <input
                      id="settings-email"
                      type="email"
                      value={settingsForm.email}
                      onChange={(event) => updateSettingsForm("email", event.target.value)}
                      required
                    />
                  </div>
                  <div className="form-control">
                    <label htmlFor="settings-birthday">Birthday</label>
                    <input
                      id="settings-birthday"
                      type="date"
                      value={settingsForm.birthday}
                      onChange={(event) => updateSettingsForm("birthday", event.target.value)}
                    />
                  </div>
                  <div className="form-control">
                    <label htmlFor="settings-password">New password</label>
                    <input
                      id="settings-password"
                      type="password"
                      value={settingsForm.new_password}
                      onChange={(event) => updateSettingsForm("new_password", event.target.value)}
                      placeholder="At least 8 characters"
                    />
                  </div>
                  <div className="form-control">
                    <label htmlFor="settings-password-confirm">Confirm new password</label>
                    <input
                      id="settings-password-confirm"
                      type="password"
                      value={settingsForm.confirm_password}
                      onChange={(event) => updateSettingsForm("confirm_password", event.target.value)}
                      placeholder="Repeat new password"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="account-card">
              <div className="account-card__header">
                <div>
                  <h2>Email Notifications</h2>
                  <p className="muted">Choose which updates you want us to send you.</p>
                </div>
              </div>
              <div className="settings-notifications">
                <div className="form-control checkbox-control settings-notifications__row">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={settingsForm.email_event_updates}
                      onChange={(event) => updateSettingsForm("email_event_updates", event.target.checked)}
                    />
                    <span>Event registrations and reminders</span>
                  </label>
                </div>
                <div className="form-control checkbox-control settings-notifications__row">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={settingsForm.email_friend_requests}
                      onChange={(event) => updateSettingsForm("email_friend_requests", event.target.checked)}
                    />
                    <span>Friend requests and account activity</span>
                  </label>
                </div>
                <div className="form-control checkbox-control settings-notifications__row">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={settingsForm.email_community_updates}
                      onChange={(event) => updateSettingsForm("email_community_updates", event.target.checked)}
                    />
                    <span>Community updates and announcements</span>
                  </label>
                </div>
              </div>
            </section>

            <section className="account-card">
              <div className="account-card__header">
                <div>
                  <h2>Privacy & Data</h2>
                  <p className="muted">Controls we can expand later for account export, blocking, and deletion.</p>
                </div>
              </div>
              <p className="muted">More privacy tools are coming soon. For now, use the visibility and friend request settings above to control how other users can find you.</p>
            </section>

            {saveStatus.message ? (
              <p className={`form-help ${saveStatus.type === "error" ? "error" : saveStatus.type === "success" ? "success" : ""}`}>
                {saveStatus.message}
              </p>
            ) : null}

            <div className="account-create__actions">
              <button className="button primary" type="submit" disabled={saveStatus.type === "loading"}>
                {saveStatus.type === "loading" ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
