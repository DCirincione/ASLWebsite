"use client";

import { type ChangeEvent, type FormEvent } from "react";

import {
  PARTNER_POSTING_TYPE_OPTIONS,
  PARTNER_SPORT_OPTIONS,
  createEmptyPartnerApplicationTeamMember,
  getPartnerApplicationPlanDetails,
  type PartnerApplicationSubmission,
  type PartnerApplicationTeamMember,
} from "@/lib/partner-application";

type FormStatus = {
  type: "idle" | "loading" | "success" | "error";
  message?: string;
};

type ExistingDraft = {
  status: "pending" | "completed" | "failed" | "expired";
  checkoutUrl?: string | null;
  completedAt?: string | null;
  error?: string | null;
};

type PartnerApplicationFormProps = {
  form: PartnerApplicationSubmission;
  status: FormStatus;
  uploadingLogo: boolean;
  existingDraft: ExistingDraft | null;
  squareCardContainerId: string;
  squareCardEnabled: boolean;
  squareCardStatusMessage?: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChange: <K extends keyof PartnerApplicationSubmission>(key: K, value: PartnerApplicationSubmission[K]) => void;
  onToggleSelection: (
    key: "sportsOffered" | "postingTypes",
    value: string,
  ) => void;
  onAddTeamMember: () => void;
  onUpdateTeamMember: (
    teamMemberId: string,
    key: keyof PartnerApplicationTeamMember,
    value: string,
  ) => void;
  onRemoveTeamMember: (teamMemberId: string) => void;
  onLogoUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onResumeCheckout: () => void;
};

const formatSubmittedAt = (value?: string | null) => {
  if (!value) return "recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

export function PartnerApplicationForm({
  form,
  status,
  uploadingLogo,
  existingDraft,
  squareCardContainerId,
  squareCardEnabled,
  squareCardStatusMessage,
  onSubmit,
  onChange,
  onToggleSelection,
  onAddTeamMember,
  onUpdateTeamMember,
  onRemoveTeamMember,
  onLogoUpload,
  onResumeCheckout,
}: PartnerApplicationFormProps) {
  const plan = getPartnerApplicationPlanDetails(form.selectedPlan);
  const canAddTeamMember = form.teamMembers.length < 5;
  const hasCompletedApplication = existingDraft?.status === "completed";
  const hasPendingCheckout = existingDraft?.status === "pending" && existingDraft.checkoutUrl;
  const shouldShowForm = !hasCompletedApplication && !hasPendingCheckout;

  return (
    <section className="account-card">
      <div className="account-card__header">
        <div>
          <h2>Apply for Partnership</h2>
          <p className="muted">
            Submit your organization details, choose a plan, and complete the required checkout to send your
            partnership request to the admin review inbox.
          </p>
        </div>
      </div>

      {hasCompletedApplication ? (
        <div className="partner-application-status partner-application-status--success">
          <h3>Application Submitted</h3>
          <p className="muted">
            Your partnership application was submitted on {formatSubmittedAt(existingDraft?.completedAt)}. The admin
            team can review it now and grant your partner role once approved.
          </p>
        </div>
      ) : null}

      {hasPendingCheckout ? (
        <div className="partner-application-status partner-application-status--pending">
          <h3>Checkout Still Pending</h3>
          <p className="muted">
            Your application draft is waiting on the required Square checkout. Resume payment to finish submitting
            your request.
          </p>
          <button className="button ghost" type="button" onClick={onResumeCheckout}>
            Resume Checkout
          </button>
        </div>
      ) : null}

      {shouldShowForm ? (
        <form className="register-form partner-application-form" onSubmit={onSubmit}>
          <section className="partner-application-section">
            <div className="partner-application-section__header">
              <p className="eyebrow">1. Organization Basics</p>
              <h3>Organization Basics</h3>
            </div>
            <div className="register-form-grid">
              <div className="form-control">
                <label htmlFor="partner-organization-name">Organization Name</label>
                <input
                  id="partner-organization-name"
                  value={form.organizationName}
                  onChange={(event) => onChange("organizationName", event.target.value)}
                  required
                />
              </div>
              <div className="form-control">
                <label htmlFor="partner-organization-logo">Organization Logo / Profile Photo</label>
                <input
                  id="partner-organization-logo"
                  type="file"
                  accept="image/*"
                  onChange={onLogoUpload}
                  disabled={uploadingLogo}
                />
                <p className="form-help muted">
                  {uploadingLogo
                    ? "Uploading logo..."
                    : form.logoUrl
                      ? "Logo uploaded successfully."
                      : "Upload a logo or profile image for your organization."}
                </p>
                {form.logoUrl ? (
                  <a className="partner-application-link" href={form.logoUrl} target="_blank" rel="noreferrer">
                    View uploaded logo
                  </a>
                ) : null}
              </div>
              <div className="form-control register-form-control--end">
                <label htmlFor="partner-organization-description">Description / Bio</label>
                <textarea
                  id="partner-organization-description"
                  value={form.description}
                  onChange={(event) => onChange("description", event.target.value)}
                  rows={5}
                  required
                />
              </div>
              <div className="form-control">
                <label htmlFor="partner-organization-website">Website</label>
                <input
                  id="partner-organization-website"
                  type="url"
                  value={form.website}
                  onChange={(event) => onChange("website", event.target.value)}
                  placeholder="https://"
                />
              </div>
              <div className="form-control">
                <label htmlFor="partner-organization-instagram">Instagram</label>
                <input
                  id="partner-organization-instagram"
                  type="url"
                  value={form.instagram}
                  onChange={(event) => onChange("instagram", event.target.value)}
                  placeholder="https://instagram.com/"
                />
              </div>
              <div className="form-control">
                <label htmlFor="partner-organization-other-social">Other Social Links</label>
                <input
                  id="partner-organization-other-social"
                  type="url"
                  value={form.otherSocialLink}
                  onChange={(event) => onChange("otherSocialLink", event.target.value)}
                  placeholder="https://"
                />
              </div>
            </div>
          </section>

          <section className="partner-application-section">
            <div className="partner-application-section__header">
              <p className="eyebrow">2. Primary Contact</p>
              <h3>Primary Contact</h3>
            </div>
            <div className="register-form-grid">
              <div className="form-control">
                <label htmlFor="partner-contact-first-name">First Name</label>
                <input
                  id="partner-contact-first-name"
                  value={form.contactFirstName}
                  onChange={(event) => onChange("contactFirstName", event.target.value)}
                  required
                />
              </div>
              <div className="form-control">
                <label htmlFor="partner-contact-last-name">Last Name</label>
                <input
                  id="partner-contact-last-name"
                  value={form.contactLastName}
                  onChange={(event) => onChange("contactLastName", event.target.value)}
                  required
                />
              </div>
              <div className="form-control">
                <label htmlFor="partner-contact-role">Role / Title</label>
                <input
                  id="partner-contact-role"
                  value={form.contactRole}
                  onChange={(event) => onChange("contactRole", event.target.value)}
                  required
                />
              </div>
              <div className="form-control">
                <label htmlFor="partner-contact-phone">Phone Number</label>
                <input
                  id="partner-contact-phone"
                  type="tel"
                  value={form.contactPhone}
                  onChange={(event) => onChange("contactPhone", event.target.value)}
                  required
                />
              </div>
              <div className="form-control">
                <label htmlFor="partner-contact-email">Email</label>
                <input
                  id="partner-contact-email"
                  type="email"
                  value={form.contactEmail}
                  onChange={(event) => onChange("contactEmail", event.target.value)}
                  required
                />
              </div>
            </div>
          </section>

          <section className="partner-application-section">
            <div className="partner-application-section__header">
              <p className="eyebrow">3. Team Members</p>
              <h3>Additional Team Members</h3>
              <p className="muted">Optional. Add up to 5 people who help run the organization.</p>
            </div>
            <div className="partner-application-team-list">
              {form.teamMembers.map((teamMember) => (
                <div key={teamMember.id} className="partner-application-team-card">
                  <div className="register-form-grid">
                    <div className="form-control">
                      <label htmlFor={`partner-team-member-name-${teamMember.id}`}>Name</label>
                      <input
                        id={`partner-team-member-name-${teamMember.id}`}
                        value={teamMember.name}
                        onChange={(event) => onUpdateTeamMember(teamMember.id, "name", event.target.value)}
                      />
                    </div>
                    <div className="form-control">
                      <label htmlFor={`partner-team-member-phone-${teamMember.id}`}>Phone Number</label>
                      <input
                        id={`partner-team-member-phone-${teamMember.id}`}
                        value={teamMember.phone}
                        onChange={(event) => onUpdateTeamMember(teamMember.id, "phone", event.target.value)}
                      />
                    </div>
                    <div className="form-control">
                      <label htmlFor={`partner-team-member-role-${teamMember.id}`}>Role</label>
                      <input
                        id={`partner-team-member-role-${teamMember.id}`}
                        value={teamMember.role}
                        onChange={(event) => onUpdateTeamMember(teamMember.id, "role", event.target.value)}
                      />
                    </div>
                  </div>
                  <button className="button ghost" type="button" onClick={() => onRemoveTeamMember(teamMember.id)}>
                    Remove Team Member
                  </button>
                </div>
              ))}
            </div>
            {canAddTeamMember ? (
              <button
                className="button ghost"
                type="button"
                onClick={onAddTeamMember}
              >
                Add Team Member
              </button>
            ) : null}
          </section>

          <section className="partner-application-section">
            <div className="partner-application-section__header">
              <p className="eyebrow">4. Sports & Categories</p>
              <h3>Sports Offered</h3>
            </div>
            <div className="partner-application-option-grid">
              {PARTNER_SPORT_OPTIONS.map((option) => (
                <label key={option.value} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.sportsOffered.includes(option.value)}
                    onChange={() => onToggleSelection("sportsOffered", option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            {form.sportsOffered.includes("other") ? (
              <div className="form-control">
                <label htmlFor="partner-other-sport">Other Sport</label>
                <input
                  id="partner-other-sport"
                  value={form.otherSport}
                  onChange={(event) => onChange("otherSport", event.target.value)}
                />
              </div>
            ) : null}
          </section>

          <section className="partner-application-section">
            <div className="partner-application-section__header">
              <p className="eyebrow">5. Posting Types</p>
              <h3>What They Plan to Post</h3>
            </div>
            <div className="partner-application-option-grid">
              {PARTNER_POSTING_TYPE_OPTIONS.map((option) => (
                <label key={option.value} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.postingTypes.includes(option.value)}
                    onChange={() => onToggleSelection("postingTypes", option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            {form.postingTypes.includes("other") ? (
              <div className="form-control">
                <label htmlFor="partner-other-posting-type">Other Posting Type</label>
                <input
                  id="partner-other-posting-type"
                  value={form.otherPostingType}
                  onChange={(event) => onChange("otherPostingType", event.target.value)}
                />
              </div>
            ) : null}
          </section>

          <section className="partner-application-section">
            <div className="partner-application-section__header">
              <p className="eyebrow">6. Non-Profit Status</p>
              <h3>Non-Profit Status</h3>
            </div>
            <div className="partner-application-radio-row">
              <label className="checkbox-label">
                <input
                  type="radio"
                  name="partner-non-profit"
                  checked={form.isNonProfit === true}
                  onChange={() => onChange("isNonProfit", true)}
                />
                <span>Yes</span>
              </label>
              <label className="checkbox-label">
                <input
                  type="radio"
                  name="partner-non-profit"
                  checked={form.isNonProfit === false}
                  onChange={() => onChange("isNonProfit", false)}
                />
                <span>No</span>
              </label>
            </div>
            {form.isNonProfit ? (
              <div className="register-form-grid">
                <div className="form-control">
                  <label htmlFor="partner-non-profit-name">Non-profit Name</label>
                  <input
                    id="partner-non-profit-name"
                    value={form.nonProfitName}
                    onChange={(event) => onChange("nonProfitName", event.target.value)}
                  />
                </div>
                <div className="form-control">
                  <label htmlFor="partner-non-profit-registration">501(c)(3) / EIN / Registration #</label>
                  <input
                    id="partner-non-profit-registration"
                    value={form.nonProfitRegistrationNumber}
                    onChange={(event) => onChange("nonProfitRegistrationNumber", event.target.value)}
                  />
                </div>
              </div>
            ) : null}
          </section>

          <section className="partner-application-section">
            <div className="partner-application-section__header">
              <p className="eyebrow">7. Plan + Payment</p>
              <h3>Select a Plan</h3>
            </div>
            <div className="partner-application-plan-card">
              <div>
                <h4>{plan.label} Plan</h4>
                <p className="muted">{plan.planDescription}</p>
              </div>
              <p className="partner-application-plan-card__amount">{plan.checkoutLabel}</p>
            </div>
            {form.selectedPlan === "standard" ? (
              <div className="form-control">
                <label htmlFor="partner-promo-code">Promo Code</label>
                <input
                  id="partner-promo-code"
                  value={form.promoCode ?? ""}
                  onChange={(event) => onChange("promoCode", event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Optional"
                />
                <p className="form-help muted">
                  Promo codes are validated securely on the server before billing starts.
                </p>
              </div>
            ) : null}
            <div className="form-control">
              <label htmlFor={squareCardContainerId}>Card Details</label>
              <div
                id={squareCardContainerId}
                className={`partner-square-card ${squareCardEnabled ? "" : "partner-square-card--disabled"}`}
                aria-live="polite"
              />
              <p className="form-help muted">
                {squareCardStatusMessage ??
                  (form.isNonProfit
                    ? "Your card will be charged a one-time $75 partnership fee."
                    : "Your card will be charged $75 for the first month, then $35/month after that.")}
              </p>
            </div>
          </section>

          <section className="partner-application-section">
            <div className="partner-application-section__header">
              <p className="eyebrow">8. Terms + Confirmation</p>
              <h3>Terms + Confirmation</h3>
            </div>
            <div className="partner-application-terms">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.termsAuthorized}
                  onChange={(event) => onChange("termsAuthorized", event.target.checked)}
                />
                <span>I am authorized to represent this organization.</span>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.termsAccuracy}
                  onChange={(event) => onChange("termsAccuracy", event.target.checked)}
                />
                <span>I agree event submissions must be accurate and may require approval before publishing.</span>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.termsTos}
                  onChange={(event) => onChange("termsTos", event.target.checked)}
                />
                <span>I agree to the platform Terms of Service.</span>
              </label>
            </div>
          </section>

          <div className="cta-row">
            <button className="button primary" type="submit" disabled={status.type === "loading" || uploadingLogo}>
              {status.type === "loading" ? "Starting Checkout..." : "Pay $75 and Submit Application"}
            </button>
          </div>
          {status.message ? (
            <p className={`form-help ${status.type === "error" ? "error" : status.type === "success" ? "success" : "muted"}`}>
              {status.message}
            </p>
          ) : null}
          {existingDraft?.status === "failed" || existingDraft?.status === "expired" ? (
            <p className="form-help error">{existingDraft.error ?? "Your previous checkout attempt did not complete."}</p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}

export const createInitialPartnerApplicationTeamMember = () => createEmptyPartnerApplicationTeamMember();
