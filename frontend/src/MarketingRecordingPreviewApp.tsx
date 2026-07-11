import clsx from "clsx";
import { type CSSProperties } from "react";
import AppChromeRow from "./components/AppChromeRow";
import BottomHeader from "./components/BottomHeader";
import CallsView from "./components/calls/CallsView";
import { useColorTheme } from "./hooks/useColorTheme";
import { useMarketingRecordingSectionPreview } from "./hooks/useMarketingRecordingSectionPreview";
import { readMarketingPreviewRecordingActiveParam } from "./lib/marketingPreview";
import { useCallsStore } from "./store/useCallsStore";
import { useStore } from "./store/useStore";

export default function MarketingRecordingPreviewApp() {
  useColorTheme();
  const recordingActive = readMarketingPreviewRecordingActiveParam();
  useMarketingRecordingSectionPreview();

  const sidePanelSide = useStore((s) => s.sidePanelSide);
  const recording = useCallsStore((s) => s.recording);

  const layoutStyle = {
    "--app-chat-col": "0px",
  } as CSSProperties;

  return (
    <div
      className={clsx(
        "app-shell marketing-preview-shell marketing-preview-shell--recording",
        recordingActive && "marketing-preview-shell--recording-static",
      )}
      aria-hidden="true"
    >
      <div
        className={clsx(
          "app-layout",
          "app-layout--panel-right",
          sidePanelSide === "left" && "app-layout--panel-left",
        )}
        style={layoutStyle}
      >
        <AppChromeRow />
        <main className="app-layout__main">
          <CallsView />
        </main>
        <BottomHeader />
      </div>
      <div
        className={clsx("app-recording-frame", !recording && "app-recording-frame--idle")}
        aria-hidden
      />
    </div>
  );
}
