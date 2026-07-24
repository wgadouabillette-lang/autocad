import { useEffect, useRef } from "react";
import {
  isMarketingPreview,
  parseMarketingPreviewNavAction,
  type MarketingPreviewNavAction,
} from "../lib/marketingPreview";

export function useMarketingPreviewNavCommands(
  onCommand: (action: MarketingPreviewNavAction) => void,
): void {
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;

  useEffect(() => {
    if (!isMarketingPreview()) return;

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const action = parseMarketingPreviewNavAction(event.data);
      if (!action) return;
      onCommandRef.current(action);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
}
