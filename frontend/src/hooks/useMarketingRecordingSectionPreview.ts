import { useEffect } from "react";
import { isMarketingRecordingPreviewScene } from "../lib/marketingPreview";
import { useCallsStore } from "../store/useCallsStore";

const RECORDING_DEMO_START = "lyte-recording-demo-start";

export function useMarketingRecordingSectionPreview(): void {
  useEffect(() => {
    if (!isMarketingRecordingPreviewScene()) return;

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== RECORDING_DEMO_START) return;

      useCallsStore.setState({
        recording: true,
        recordingBusy: false,
        mediaError: null,
      });
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
}
