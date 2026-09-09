import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
  DEFAULT_APP_LOCALE,
  resolveAppLocale,
  type AppLocale,
  type LocalePreference,
} from "./appLocale";
import { readUserPreferences } from "./userPreferences";

import en from "../locales/en/translation.json";
import fr from "../locales/fr/translation.json";
import es from "../locales/es/translation.json";
import de from "../locales/de/translation.json";
import pt from "../locales/pt/translation.json";
import it from "../locales/it/translation.json";
import ja from "../locales/ja/translation.json";
import zh from "../locales/zh/translation.json";

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  es: { translation: es },
  de: { translation: de },
  pt: { translation: pt },
  it: { translation: it },
  ja: { translation: ja },
  zh: { translation: zh },
} as const;

const bootPreference = readUserPreferences().locale;
const bootLocale = resolveAppLocale(bootPreference);

void i18n.use(initReactI18next).init({
  resources,
  lng: bootLocale,
  fallbackLng: DEFAULT_APP_LOCALE,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function applyAppLocale(preference: LocalePreference): AppLocale {
  const locale = resolveAppLocale(preference);
  if (i18n.language !== locale) {
    void i18n.changeLanguage(locale);
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
  return locale;
}

applyAppLocale(bootPreference);

export default i18n;
