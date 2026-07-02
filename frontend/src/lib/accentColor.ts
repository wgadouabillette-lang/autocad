import type { UserPreferences } from "./userPreferences";
import { readUserPreferences } from "./userPreferences";

export type AccentColorPreference = "blue" | "emerald" | "amber" | "cyan";

export interface AccentColorOption {
  id: AccentColorPreference;
  title: string;
  description: string;
  swatch: string;
}

type AccentCssVars = Record<string, string>;

const ACCENT_CSS_KEYS = [
  "--forma-brand",
  "--forma-brand-strong",
  "--forma-brand-shadow",
  "--forma-brand-border",
  "--forma-brand-muted",
  "--forma-brand-bar",
  "--forma-brand-light",
  "--forma-brand-glow",
  "--forma-brand-focus",
  "--forma-brand-highlight",
  "--forma-brand-icon",
  "--forma-brand-chrome-base",
  "--forma-brand-chrome-mid",
  "--forma-brand-chrome-deep",
  "--forma-brand-submit",
  "--forma-brand-light-text",
] as const;

const ACCENT_PALETTES: Record<AccentColorPreference, AccentCssVars> = {
  blue: {
    "--forma-brand": "59 111 232",
    "--forma-brand-strong": "47 92 196",
    "--forma-brand-shadow": "36 84 196",
    "--forma-brand-border": "120 162 255",
    "--forma-brand-muted": "168 182 210",
    "--forma-brand-bar": "45 95 215",
    "--forma-brand-light": "59 130 246",
    "--forma-brand-glow": "37 99 235",
    "--forma-brand-focus": "96 165 250",
    "--forma-brand-highlight": "147 197 253",
    "--forma-brand-icon": "191 219 254",
    "--forma-brand-chrome-base": "24 46 82",
    "--forma-brand-chrome-mid": "34 58 94",
    "--forma-brand-chrome-deep": "18 38 72",
    "--forma-brand-submit": "56 110 195",
    "--forma-brand-light-text": "29 78 216",
  },
  emerald: {
    "--forma-brand": "16 185 129",
    "--forma-brand-strong": "5 150 105",
    "--forma-brand-shadow": "4 120 87",
    "--forma-brand-border": "52 211 153",
    "--forma-brand-muted": "167 243 208",
    "--forma-brand-bar": "4 120 87",
    "--forma-brand-light": "34 197 94",
    "--forma-brand-glow": "5 150 105",
    "--forma-brand-focus": "74 222 128",
    "--forma-brand-highlight": "134 239 172",
    "--forma-brand-icon": "187 247 208",
    "--forma-brand-chrome-base": "6 44 32",
    "--forma-brand-chrome-mid": "8 58 42",
    "--forma-brand-chrome-deep": "4 30 22",
    "--forma-brand-submit": "5 150 105",
    "--forma-brand-light-text": "4 120 87",
  },
  amber: {
    "--forma-brand": "245 158 11",
    "--forma-brand-strong": "217 119 6",
    "--forma-brand-shadow": "180 83 9",
    "--forma-brand-border": "251 191 36",
    "--forma-brand-muted": "253 230 138",
    "--forma-brand-bar": "180 83 9",
    "--forma-brand-light": "245 158 11",
    "--forma-brand-glow": "217 119 6",
    "--forma-brand-focus": "251 191 36",
    "--forma-brand-highlight": "252 211 77",
    "--forma-brand-icon": "254 243 199",
    "--forma-brand-chrome-base": "69 42 8",
    "--forma-brand-chrome-mid": "92 55 10",
    "--forma-brand-chrome-deep": "52 32 6",
    "--forma-brand-submit": "217 119 6",
    "--forma-brand-light-text": "180 83 9",
  },
  cyan: {
    "--forma-brand": "6 182 212",
    "--forma-brand-strong": "8 145 178",
    "--forma-brand-shadow": "14 116 144",
    "--forma-brand-border": "34 211 238",
    "--forma-brand-muted": "165 243 252",
    "--forma-brand-bar": "14 116 144",
    "--forma-brand-light": "6 182 212",
    "--forma-brand-glow": "8 145 178",
    "--forma-brand-focus": "34 211 238",
    "--forma-brand-highlight": "103 232 249",
    "--forma-brand-icon": "207 250 254",
    "--forma-brand-chrome-base": "8 40 48",
    "--forma-brand-chrome-mid": "12 54 64",
    "--forma-brand-chrome-deep": "6 28 34",
    "--forma-brand-submit": "8 145 178",
    "--forma-brand-light-text": "14 116 144",
  },
};

export const ACCENT_COLOR_OPTIONS: AccentColorOption[] = [
  {
    id: "blue",
    title: "Blue",
    description: "Default Hall accent.",
    swatch: "#3b6fe8",
  },
  {
    id: "emerald",
    title: "Emerald",
    description: "Green accent across the app.",
    swatch: "#10b981",
  },
  {
    id: "amber",
    title: "Amber",
    description: "Golden orange accent.",
    swatch: "#f59e0b",
  },
  {
    id: "cyan",
    title: "Cyan",
    description: "Bright cyan accent.",
    swatch: "#06b6d4",
  },
];

export function normalizeAccentColorPreference(value: unknown): AccentColorPreference {
  if (value === "emerald" || value === "amber" || value === "cyan") {
    return value;
  }
  return "blue";
}

export function readAccentColorPreference(): AccentColorPreference {
  return normalizeAccentColorPreference(readUserPreferences().accentColor);
}

export function applyDocumentAccentColor(accent: AccentColorPreference): void {
  const root = document.documentElement;
  const palette = ACCENT_PALETTES[accent] ?? ACCENT_PALETTES.blue;
  root.dataset.accent = accent;
  for (const key of ACCENT_CSS_KEYS) {
    root.style.setProperty(key, palette[key] ?? ACCENT_PALETTES.blue[key]!);
  }
}

export function bootstrapDocumentAccentColor(
  prefs?: Pick<UserPreferences, "accentColor">,
): void {
  const accent = normalizeAccentColorPreference(
    prefs?.accentColor ?? readAccentColorPreference(),
  );
  applyDocumentAccentColor(accent);
}
