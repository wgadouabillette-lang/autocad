import { useEffect } from "react";
import { applyDocumentAccentColor } from "../lib/accentColor";
import { useStore } from "../store/useStore";

export function useAccentColor(): void {
  const accentColor = useStore((s) => s.accentColor);
  const setAccentColor = useStore((s) => s.setAccentColor);

  useEffect(() => {
    applyDocumentAccentColor("blue");
    if (accentColor !== "blue") setAccentColor("blue");
  }, [accentColor, setAccentColor]);
}
