/** Palette UI + viewport. */
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

/** Apparence des matériaux dans le viewport. */
export const MATERIAL_VIEW: Record<string, { color: string; metalness: number; roughness: number }> = {
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
