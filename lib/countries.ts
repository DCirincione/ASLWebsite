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

type CountryFlagAsset = {
  src: string;
  width: number;
  height: number;
};

export const getCountryFlagAsset = (value?: string | null): CountryFlagAsset | null => {
  const normalized = normalizeCountryCode(value);
  if (!normalized) return null;

  const customFlags: Record<string, CountryFlagAsset> = {
    AR: { src: "/flags/argentina.png", width: 1280, height: 800 },
    BR: { src: "/flags/brazil.png", width: 1280, height: 896 },
    GT: { src: "/flags/guat.png", width: 1280, height: 853 },
    DO: { src: "/flags/dominican.png", width: 900, height: 600 },
    EC: { src: "/flags/ecuador.png", width: 3840, height: 2560 },
    SV: { src: "/flags/elsalvador.png", width: 1600, height: 900 },
    GB: { src: "/flags/england.png", width: 330, height: 198 },
    ES: { src: "/flags/espana.png", width: 750, height: 500 },
    FR: { src: "/flags/france.png", width: 330, height: 220 },
    CO: { src: "/flags/columbia.png", width: 1200, height: 800 },
    HN: { src: "/flags/honduras.png", width: 894, height: 598 },
    IN: { src: "/flags/india.png", width: 1280, height: 854 },
    IT: { src: "/flags/italy.png", width: 1280, height: 854 },
    MX: { src: "/flags/mexico.png", width: 960, height: 549 },
    PL: { src: "/flags/poland.png", width: 1280, height: 800 },
    PR: { src: "/flags/puertorico.png", width: 330, height: 220 },
    RU: { src: "/flags/russia.png", width: 330, height: 220 },
    TR: { src: "/flags/turkey.png", width: 1200, height: 800 },
    US: { src: "/flags/US.webp", width: 800, height: 533 },
    VE: { src: "/flags/venezuela.png", width: 1600, height: 1067 },
  };

  return customFlags[normalized] ?? null;
};
