import type { UserPreferences } from "./userPreferences";
import { readUserPreferences } from "./userPreferences";

/** Palette UI + viewport (dark). */
export interface ThemePalette {
  bg: string;
  bgPanel: string;
  bgElevated: string;
  bgHover: string;
  bgChrome: string;
  bgLeftPanel: string;
  border: string;
  text: string;
  textBright: string;
  textMuted: string;
  textDim: string;
  accent: string;
  accentStrong: string;
  gridCell: string;
  gridSection: string;
  gridMajor: string;
  viewportLight: string;
  edge: string;
  edgeLabel: string;
  highlight: string;
}

export const THEME: ThemePalette = {
  bg: "#1a1a1a",
  bgPanel: "#1e1e1e",
  bgElevated: "#242424",
  bgHover: "#262626",
  bgChrome: "#121212",
  bgLeftPanel: "#1a1a1a",
  border: "#333333",
  text: "#e0e0e0",
  textBright: "#f0f0f0",
  textMuted: "#808080",
  textDim: "#737373",
  accent: "#b3b3b3",
  accentStrong: "#999999",
  gridCell: "#333333",
  gridSection: "#404040",
  gridMajor: "#333333",
  viewportLight: "#e0e0e0",
  edge: "#333333",
  edgeLabel: "#121212",
  highlight: "#cccccc",
};

/** Same hues inverted for light mode. */
export const THEME_LIGHT: ThemePalette = {
  bg: "#ffffff",
  bgPanel: "#f5f5f5",
  bgElevated: "#ebebeb",
  bgHover: "#e8e8e8",
  bgChrome: "#ffffff",
  bgLeftPanel: "#f5f5f5",
  border: "#d4d4d4",
  text: "#1a1a1a",
  textBright: "#0a0a0a",
  textMuted: "#737373",
  textDim: "#6b6b6b",
  accent: "#525252",
  accentStrong: "#404040",
  gridCell: "#d4d4d4",
  gridSection: "#c4c4c4",
  gridMajor: "#d4d4d4",
  viewportLight: "#404040",
  edge: "#d4d4d4",
  edgeLabel: "#fafafa",
  highlight: "#525252",
};

/** Apparence des matériaux dans le viewport. */
export const MATERIAL_VIEW: Record<
  string,
  { color: string; metalness: number; roughness: number }
> = {
  aluminium: { color: "#a8a8a8", metalness: 0.88, roughness: 0.32 },
  acier: { color: "#8a8a8a", metalness: 0.92, roughness: 0.28 },
  inox: { color: "#b8b8b8", metalness: 0.96, roughness: 0.16 },
  titane: { color: "#7a7a7a", metalness: 0.82, roughness: 0.42 },
  laiton: { color: "#a89070", metalness: 0.9, roughness: 0.3 },
  pla: { color: "#9e9e9e", metalness: 0.0, roughness: 0.68 },
  abs: { color: "#7a7a7a", metalness: 0.0, roughness: 0.78 },
  petg: { color: "#8a8a8a", metalness: 0.04, roughness: 0.52 },
  nylon: { color: "#c0c0c0", metalness: 0.0, roughness: 0.82 },
};

export type ColorThemePreference = "dark" | "light" | "system";
export type EffectiveColorTheme = "dark" | "light";

const SYSTEM_LIGHT_START_HOUR = 7;
const SYSTEM_LIGHT_END_HOUR = 19;

export function isDaytime(date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= SYSTEM_LIGHT_START_HOUR && hour < SYSTEM_LIGHT_END_HOUR;
}

export function resolveEffectiveTheme(
  preference: ColorThemePreference,
  now = new Date(),
): EffectiveColorTheme {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return isDaytime(now) ? "light" : "dark";
}

export function normalizeColorThemePreference(value: unknown): ColorThemePreference {
  if (value === "light" || value === "system") return value;
  return "dark";
}

export function readColorThemePreference(): ColorThemePreference {
  return normalizeColorThemePreference(readUserPreferences().colorTheme);
}

export function getThemePalette(effective: EffectiveColorTheme = readEffectiveThemeFromDocument()): ThemePalette {
  return effective === "light" ? THEME_LIGHT : THEME;
}

export function readEffectiveThemeFromDocument(): EffectiveColorTheme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function applyDocumentTheme(effective: EffectiveColorTheme): void {
  const root = document.documentElement;
  root.dataset.theme = effective;
  root.style.colorScheme = effective;

  const themeColor = effective === "light" ? "#fafafa" : "#121212";
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  metaTheme?.setAttribute("content", themeColor);

  const metaScheme = document.querySelector('meta[name="color-scheme"]');
  metaScheme?.setAttribute("content", effective);
}

export function bootstrapDocumentTheme(prefs?: Pick<UserPreferences, "colorTheme">): void {
  const preference = normalizeColorThemePreference(prefs?.colorTheme ?? readColorThemePreference());
  applyDocumentTheme(resolveEffectiveTheme(preference));
}

export function msUntilNextSystemThemeChange(now = new Date()): number {
  const next = new Date(now);
  if (isDaytime(now)) {
    next.setHours(SYSTEM_LIGHT_END_HOUR, 0, 0, 0);
  } else if (now.getHours() >= SYSTEM_LIGHT_END_HOUR) {
    next.setDate(next.getDate() + 1);
    next.setHours(SYSTEM_LIGHT_START_HOUR, 0, 0, 0);
  } else {
    next.setHours(SYSTEM_LIGHT_START_HOUR, 0, 0, 0);
  }
  return Math.max(1_000, next.getTime() - now.getTime());
}
