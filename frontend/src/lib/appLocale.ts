/** App UI languages (top 8). English is the default and fallback. */

export const APP_LOCALES = ["en", "fr", "es", "de", "pt", "it", "ja", "zh"] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export type LocalePreference = AppLocale | "system";

export const APP_LOCALE_LABELS: Record<AppLocale, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  de: "Deutsch",
  pt: "Português",
  it: "Italiano",
  ja: "日本語",
  zh: "中文",
};

export const DEFAULT_APP_LOCALE: AppLocale = "en";

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (APP_LOCALES as readonly string[]).includes(value);
}

export function normalizeLocalePreference(value: unknown): LocalePreference {
  if (value === "system") return "system";
  if (isAppLocale(value)) return value;
  return DEFAULT_APP_LOCALE;
}

/** Map browser language tags onto our AppLocale set. */
export function appLocaleFromNavigator(
  languages: readonly string[] = typeof navigator !== "undefined"
    ? navigator.languages?.length
      ? navigator.languages
      : [navigator.language || "en"]
    : ["en"],
): AppLocale {
  for (const raw of languages) {
    const tag = String(raw || "").toLowerCase();
    if (!tag) continue;
    const primary = tag.split("-")[0] || tag;
    if (primary === "zh") return "zh";
    if (isAppLocale(primary)) return primary;
  }
  return DEFAULT_APP_LOCALE;
}

export function resolveAppLocale(preference: LocalePreference = DEFAULT_APP_LOCALE): AppLocale {
  if (preference === "system") return appLocaleFromNavigator();
  return isAppLocale(preference) ? preference : DEFAULT_APP_LOCALE;
}

/** BCP 47 tag for Intl formatting. */
export function intlLocaleForAppLocale(locale: AppLocale): string {
  switch (locale) {
    case "en":
      return "en-US";
    case "fr":
      return "fr-FR";
    case "es":
      return "es-ES";
    case "de":
      return "de-DE";
    case "pt":
      return "pt-BR";
    case "it":
      return "it-IT";
    case "ja":
      return "ja-JP";
    case "zh":
      return "zh-CN";
    default:
      return "en-US";
  }
}
