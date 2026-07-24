/** Devise de présentation + localisation des prix USD (affichage checkout). */

/**
 * Fuseau → pays. Prioritaire sur `navigator.language` : beaucoup d'utilisateurs
 * au Canada ont `en-US` comme langue système, ce qui masquait le CAD.
 */
const TZ_COUNTRY: Record<string, string> = {
  // Canada
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "America/Edmonton": "CA",
  "America/Winnipeg": "CA",
  "America/Halifax": "CA",
  "America/St_Johns": "CA",
  "America/Montreal": "CA",
  "America/Regina": "CA",
  "America/Whitehorse": "CA",
  "America/Yellowknife": "CA",
  "America/Iqaluit": "CA",
  "America/Goose_Bay": "CA",
  "America/Glace_Bay": "CA",
  "America/Moncton": "CA",
  "America/Nipigon": "CA",
  "America/Thunder_Bay": "CA",
  "America/Pangnirtung": "CA",
  "America/Rankin_Inlet": "CA",
  "America/Cambridge_Bay": "CA",
  "America/Inuvik": "CA",
  "America/Dawson_Creek": "CA",
  "America/Fort_Nelson": "CA",
  "America/Creston": "CA",
  "America/Atikokan": "CA",
  "America/Blanc-Sablon": "CA",
  // États-Unis
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Phoenix": "US",
  "America/Anchorage": "US",
  "America/Honolulu": "US",
  "America/Detroit": "US",
  "America/Boise": "US",
  "America/Indiana/Indianapolis": "US",
  // Autres
  "Europe/Paris": "FR",
  "Europe/London": "GB",
  "Europe/Berlin": "DE",
  "Europe/Madrid": "ES",
  "Europe/Rome": "IT",
  "Europe/Amsterdam": "NL",
  "Europe/Brussels": "BE",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Pacific/Auckland": "NZ",
  "Asia/Tokyo": "JP",
  "Asia/Singapore": "SG",
  "Asia/Hong_Kong": "HK",
  "America/Mexico_City": "MX",
  "America/Sao_Paulo": "BR",
};

const COUNTRY_CURRENCY: Record<string, string> = {
  US: "USD",
  CA: "CAD",
  GB: "GBP",
  AU: "AUD",
  NZ: "NZD",
  JP: "JPY",
  CH: "CHF",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  MX: "MXN",
  BR: "BRL",
  IN: "INR",
  SG: "SGD",
  HK: "HKD",
  KR: "KRW",
  ZA: "ZAR",
  AE: "AED",
  FR: "EUR",
  DE: "EUR",
  ES: "EUR",
  IT: "EUR",
  NL: "EUR",
  BE: "EUR",
  PT: "EUR",
  IE: "EUR",
  AT: "EUR",
  FI: "EUR",
};

function regionFromLocaleTag(tag: string): string | null {
  const parts = tag.replace("_", "-").split("-");
  if (parts.length < 2) return null;
  const region = parts[1]?.toUpperCase() ?? "";
  return /^[A-Z]{2}$/.test(region) ? region : null;
}

export function resolveClientLocale(): string {
  if (typeof navigator === "undefined") return "en-US";
  // Préfère une locale avec région (en-CA) si présente dans la liste.
  const languages =
    typeof navigator.languages !== "undefined" && navigator.languages.length > 0
      ? Array.from(navigator.languages)
      : [navigator.language || "en-US"];
  const withRegion = languages.find((lang) => regionFromLocaleTag(lang));
  return withRegion || languages[0] || "en-US";
}

export function resolveClientCountry(): string | null {
  // 1) Fuseau horaire — reflet réel du lieu (ex. Toronto + langue en-US).
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
  } catch {
    /* ignore */
  }

  // 2) Locales navigateur (en-CA, fr-CA, …).
  if (typeof navigator !== "undefined") {
    const languages =
      typeof navigator.languages !== "undefined" && navigator.languages.length > 0
        ? Array.from(navigator.languages)
        : [navigator.language || ""];
    for (const lang of languages) {
      const region = regionFromLocaleTag(lang);
      if (region) return region;
    }
  }

  return regionFromLocaleTag(resolveClientLocale());
}

/** Devise préférée depuis fuseau / locale (fallback USD). */
export function resolveClientCurrency(): string {
  const country = resolveClientCountry();
  if (country && COUNTRY_CURRENCY[country]) return COUNTRY_CURRENCY[country];
  return "USD";
}

export function formatMoneyCents(
  amountCents: number,
  currency: string,
  locale = resolveClientLocale(),
): string {
  const cur = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: cur,
      currencyDisplay: "narrowSymbol",
    }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${cur}`;
  }
}

export type LocalizedMoney = {
  currency: string;
  amountCents: number;
  amountLabel: string;
  usdCents: number;
  usdLabel: string;
  fxRate: number;
  converted: boolean;
  frequencyLabel: string;
};
