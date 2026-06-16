import { useMemo } from "react";
import {
  getThemePalette,
  resolveEffectiveTheme,
  type ThemePalette,
} from "../lib/theme";
import { useStore } from "../store/useStore";

export function useThemePalette(): ThemePalette {
  const colorTheme = useStore((s) => s.colorTheme);
  return useMemo(
    () => getThemePalette(resolveEffectiveTheme(colorTheme)),
    [colorTheme],
  );
}
