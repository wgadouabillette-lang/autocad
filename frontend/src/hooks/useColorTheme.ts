import { useEffect } from "react";
import {
  applyDocumentTheme,
  msUntilNextSystemThemeChange,
  resolveEffectiveTheme,
} from "../lib/theme";
import { useStore } from "../store/useStore";

export function useColorTheme(): void {
  const colorTheme = useStore((s) => s.colorTheme);

  useEffect(() => {
    const apply = () => {
      applyDocumentTheme(resolveEffectiveTheme(colorTheme));
    };

    apply();

    if (colorTheme !== "system") return;

    let timeoutId = window.setTimeout(function schedule() {
      apply();
      timeoutId = window.setTimeout(schedule, msUntilNextSystemThemeChange());
    }, msUntilNextSystemThemeChange());

    const intervalId = window.setInterval(apply, 60_000);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [colorTheme]);
}
