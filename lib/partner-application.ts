import { createId } from "@/lib/create-id";

export const PARTNER_APPLICATION_SETUP_FEE_CENTS = 7500;
export const PARTNER_APPLICATION_STANDARD_MONTHLY_CENTS = 3500;
export const PARTNER_APPLICATION_PAYMENT_CURRENCY = "USD";
export const PARTNER_APPLICATION_CHECKOUT_WINDOW_MS = 30 * 60 * 1000;

export const PARTNER_SPORT_OPTIONS = [
  { value: "soccer", label: "Soccer" },
  { value: "basketball", label: "Basketball" },
  { value: "pickleball", label: "Pickleball" },
  { value: "flag-football", label: "Flag Football" },
  { value: "golf", label: "Golf" },
  { value: "baseball-softball", label: "Baseball / Softball" },
  { value: "volleyball", label: "Volleyball" },
  { value: "hockey", label: "Hockey" },
  { value: "lacrosse", label: "Lacrosse" },
  { value: "fitness-training", label: "Fitness / Training" },
  { value: "other", label: "Other" },
] as const;

export const PARTNER_POSTING_TYPE_OPTIONS = [
  { value: "trainings-clinics", label: "Trainings / Clinics" },
  { value: "pickup-sessions", label: "Pickup Sessions" },
  { value: "tournaments-leagues", label: "Tournaments / Leagues" },
  { value: "camps", label: "Camps" },
  { value: "tryouts", label: "Tryouts" },
  { value: "other", label: "Other" },
] as const;

export type PartnerApplicationSport = (typeof PARTNER_SPORT_OPTIONS)[number]["value"];
export type PartnerApplicationPostingType = (typeof PARTNER_POSTING_TYPE_OPTIONS)[number]["value"];
export type PartnerApplicationPlan = "standard" | "nonprofit";

export type PartnerApplicationTeamMember = {
  id: string;
  name: string;
  phone: string;
  role: string;
};

export type PartnerApplicationSubmission = {
  organizationName: string;
  logoUrl: string;
  description: string;
  website: string;
  instagram: string;
  otherSocialLink: string;
  contactFirstName: string;
  contactLastName: string;
  contactRole: string;
  contactPhone: string;
  contactEmail: string;
  teamMembers: PartnerApplicationTeamMember[];
  sportsOffered: PartnerApplicationSport[];
  otherSport: string;
  postingTypes: PartnerApplicationPostingType[];
  otherPostingType: string;
  isNonProfit: boolean | null;
  nonProfitName: string;
  nonProfitRegistrationNumber: string;
  selectedPlan: PartnerApplicationPlan;
  termsAuthorized: boolean;
  termsAccuracy: boolean;
  termsTos: boolean;
};

type PartialSubmission = Partial<PartnerApplicationSubmission> & {
  teamMembers?: unknown;
  sportsOffered?: unknown;
  postingTypes?: unknown;
  isNonProfit?: unknown;
};

const sportValues = new Set<string>(PARTNER_SPORT_OPTIONS.map((option) => option.value));
const postingTypeValues = new Set<string>(PARTNER_POSTING_TYPE_OPTIONS.map((option) => option.value));

const asTrimmedString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const asBoolean = (value: unknown) => value === true;

const sanitizeUrl = (value: unknown) => {
  const trimmed = asTrimmedString(value);
  if (!trimmed) return "";
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
};

const sanitizeSelectionList = <T extends string>(value: unknown, allowedValues: Set<string>) =>
  Array.from(
    new Set(
      Array.isArray(value)
        ? value.flatMap((entry) => {
            const next = asTrimmedString(entry);
            return next && allowedValues.has(next) ? [next as T] : [];
          })
        : [],
    ),
  );

const sanitizeTeamMembers = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .slice(0, 5)
    .map((entry) => {
      const member = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
      return {
        id: asTrimmedString(member.id) || createId(),
        name: asTrimmedString(member.name),
        phone: asTrimmedString(member.phone),
        role: asTrimmedString(member.role),
      } satisfies PartnerApplicationTeamMember;
    })
    .filter((member) => member.name || member.phone || member.role);

export const createEmptyPartnerApplicationTeamMember = (): PartnerApplicationTeamMember => ({
  id: createId(),
  name: "",
  phone: "",
  role: "",
});

export const createEmptyPartnerApplicationForm = (): PartnerApplicationSubmission => ({
  organizationName: "",
  logoUrl: "",
  description: "",
  website: "",
  instagram: "",
  otherSocialLink: "",
  contactFirstName: "",
  contactLastName: "",
  contactRole: "",
  contactPhone: "",
  contactEmail: "",
  teamMembers: [],
  sportsOffered: [],
  otherSport: "",
  postingTypes: [],
  otherPostingType: "",
  isNonProfit: null,
  nonProfitName: "",
  nonProfitRegistrationNumber: "",
  selectedPlan: "standard",
  termsAuthorized: false,
  termsAccuracy: false,
  termsTos: false,
});

export const normalizePartnerApplicationPlan = (isNonProfit: boolean | null, selectedPlan?: unknown): PartnerApplicationPlan => {
  if (isNonProfit) return "nonprofit";
  return selectedPlan === "nonprofit" ? "standard" : "standard";
};

export const sanitizePartnerApplicationSubmission = (value: unknown): PartnerApplicationSubmission => {
  const input = value && typeof value === "object" ? (value as PartialSubmission) : {};
  const isNonProfit = input.isNonProfit === true ? true : input.isNonProfit === false ? false : null;

  return {
    organizationName: asTrimmedString(input.organizationName),
    logoUrl: sanitizeUrl(input.logoUrl),
    description: asTrimmedString(input.description),
    website: sanitizeUrl(input.website),
    instagram: sanitizeUrl(input.instagram),
    otherSocialLink: sanitizeUrl(input.otherSocialLink),
    contactFirstName: asTrimmedString(input.contactFirstName),
    contactLastName: asTrimmedString(input.contactLastName),
    contactRole: asTrimmedString(input.contactRole),
    contactPhone: asTrimmedString(input.contactPhone),
    contactEmail: asTrimmedString(input.contactEmail),
    teamMembers: sanitizeTeamMembers(input.teamMembers),
    sportsOffered: sanitizeSelectionList<PartnerApplicationSport>(input.sportsOffered, sportValues),
    otherSport: asTrimmedString(input.otherSport),
    postingTypes: sanitizeSelectionList<PartnerApplicationPostingType>(input.postingTypes, postingTypeValues),
    otherPostingType: asTrimmedString(input.otherPostingType),
    isNonProfit,
    nonProfitName: asTrimmedString(input.nonProfitName),
    nonProfitRegistrationNumber: asTrimmedString(input.nonProfitRegistrationNumber),
    selectedPlan: normalizePartnerApplicationPlan(isNonProfit, input.selectedPlan),
    termsAuthorized: asBoolean(input.termsAuthorized),
    termsAccuracy: asBoolean(input.termsAccuracy),
    termsTos: asBoolean(input.termsTos),
  };
};

const isValidUrl = (value: string) => {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value);

export const validatePartnerApplicationSubmission = (application: PartnerApplicationSubmission) => {
  if (!application.organizationName) return "Organization Name is required.";
  if (!application.logoUrl) return "Organization Logo / Profile Photo is required.";
  if (!application.description) return "Description / Bio is required.";
  if (!application.contactFirstName) return "Primary Contact First Name is required.";
  if (!application.contactLastName) return "Primary Contact Last Name is required.";
  if (!application.contactRole) return "Primary Contact Role / Title is required.";
  if (!application.contactPhone) return "Primary Contact Phone Number is required.";
  if (!application.contactEmail) return "Primary Contact Email is required.";
  if (!isValidEmail(application.contactEmail)) return "Enter a valid Primary Contact Email.";
  if (!application.sportsOffered.length) return "Choose at least one sport offered.";
  if (application.sportsOffered.includes("other") && !application.otherSport) {
    return "Enter the other sport you offer.";
  }
  if (!application.postingTypes.length) return "Choose at least one posting type.";
  if (application.postingTypes.includes("other") && !application.otherPostingType) {
    return "Enter the other posting type you plan to post.";
  }
  if (application.isNonProfit === null) return "Choose whether your organization is a non-profit.";
  if (!application.termsAuthorized) return "Confirm that you are authorized to represent this organization.";
  if (!application.termsAccuracy) {
    return "Confirm that event submissions will be accurate and may require approval.";
  }
  if (!application.termsTos) return "You must agree to the platform Terms of Service.";
  if (!isValidUrl(application.website)) return "Enter a valid Website URL.";
  if (!isValidUrl(application.instagram)) return "Enter a valid Instagram URL.";
  if (!isValidUrl(application.otherSocialLink)) return "Enter a valid Other Social Link URL.";

  return null;
};

export const getPartnerApplicationPlanDetails = (plan: PartnerApplicationPlan) =>
  plan === "nonprofit"
    ? {
        label: "Non-profit",
        checkoutAmountCents: PARTNER_APPLICATION_SETUP_FEE_CENTS,
        planDescription: "$75 flat, no monthly fee",
        checkoutLabel: "$75 flat due now",
      }
    : {
        label: "Standard",
        checkoutAmountCents: PARTNER_APPLICATION_SETUP_FEE_CENTS,
        planDescription: "$75 setup + $35/month recurring",
        checkoutLabel: "$75 setup due now",
      };

export const formatPartnerApplicationSelection = (
  values: readonly string[],
  options: ReadonlyArray<{ value: string; label: string }>,
  otherText: string,
) => {
  const labelByValue = new Map(options.map((option) => [option.value, option.label]));
  const labels = values
    .map((value) => labelByValue.get(value) ?? value)
    .filter(Boolean);

  if (values.includes("other") && otherText) {
    labels[labels.length - 1] = `Other (${otherText})`;
  }

  return labels.join(", ") || "None";
};
