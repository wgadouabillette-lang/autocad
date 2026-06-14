import { useEffect, useState } from "react";

export const MOBILE_LAYOUT_QUERY = "(max-width: 767px)";

export function useMobileLayout() {
  const [isMobileLayout, setIsMobileLayout] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_LAYOUT_QUERY).matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_LAYOUT_QUERY);
    const syncLayout = () => setIsMobileLayout(mediaQuery.matches);
    syncLayout();
    mediaQuery.addEventListener("change", syncLayout);
    return () => mediaQuery.removeEventListener("change", syncLayout);
  }, []);

  return isMobileLayout;
}
