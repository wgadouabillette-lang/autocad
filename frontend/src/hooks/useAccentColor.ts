import { useEffect } from "react";
import { applyDocumentAccentColor } from "../lib/accentColor";
import { useStore } from "../store/useStore";

export function useAccentColor(): void {
  const accentColor = useStore((s) => s.accentColor);

  useEffect(() => {
    applyDocumentAccentColor(accentColor);
  }, [accentColor]);
}
