import { useEffect } from "react";
import { applyDocumentTheme } from "../lib/theme";

export function useColorTheme(): void {
  useEffect(() => {
    applyDocumentTheme();
  }, []);
}
