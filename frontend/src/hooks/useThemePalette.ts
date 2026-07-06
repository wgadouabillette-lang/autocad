import { getThemePalette, type ThemePalette } from "../lib/theme";

export function useThemePalette(): ThemePalette {
  return getThemePalette();
}
