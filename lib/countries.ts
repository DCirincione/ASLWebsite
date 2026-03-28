import countryOptionsData from "@/data/countries.json";

type CountryOption = {
  code: string;
  name: string;
};

const callingCodeMap: Record<string, string> = {
  "+1": "US",
  "1": "US",
  "+44": "GB",
  "44": "GB",
  "+52": "MX",
  "52": "MX",
  "+61": "AU",
  "61": "AU",
};

export const COUNTRY_OPTIONS = (countryOptionsData as CountryOption[]).map((country) => ({
  code: country.code,
  name: country.name,
}));

const countryNameMap = new Map(COUNTRY_OPTIONS.map((country) => [country.code, country.name]));

export const normalizeCountryCode = (value?: string | null) => {
  const normalized = (value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  if (/^[A-Z]{2}$/.test(normalized) && countryNameMap.has(normalized)) {
    return normalized;
  }
  return callingCodeMap[normalized] ?? null;
};

export const getCountryNameFromCode = (value?: string | null) => {
  const normalized = normalizeCountryCode(value);
  if (!normalized) return null;
  return countryNameMap.get(normalized) ?? null;
};

export const countryCodeToFlag = (value?: string | null) => {
  const normalized = normalizeCountryCode(value);
  if (!normalized) return null;
  return String.fromCodePoint(...Array.from(normalized).map((char) => 127397 + char.charCodeAt(0)));
};
