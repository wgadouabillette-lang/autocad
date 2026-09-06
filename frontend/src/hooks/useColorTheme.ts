import { useEffect } from "react";
import { applyDocumentTheme } from "../lib/theme";
import { useStore } from "../store/useStore";

export function useColorTheme(): void {
  const colorTheme = useStore((s) => s.colorTheme);

  useEffect(() => {
    applyDocumentTheme(colorTheme);
  }, [colorTheme]);
}
