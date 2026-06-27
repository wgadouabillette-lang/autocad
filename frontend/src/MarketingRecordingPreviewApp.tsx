import clsx from "clsx";
import { type CSSProperties } from "react";
import AppChromeRow from "./components/AppChromeRow";
import BottomHeader from "./components/BottomHeader";
import CallsView from "./components/calls/CallsView";
import { useColorTheme } from "./hooks/useColorTheme";
import { useMarketingRecordingSectionPreview } from "./hooks/useMarketingRecordingSectionPreview";
import { useCallsStore } from "./store/useCallsStore";
import { useStore } from "./store/useStore";

export default function MarketingRecordingPreviewApp() {
  useColorTheme();
  useMarketingRecordingSectionPreview();

  const sidePanelSide = useStore((s) => s.sidePanelSide);
  const recording = useCallsStore((s) => s.recording);

  const layoutStyle = {
    "--app-chat-col": "0px",
  } as CSSProperties;

  return (
    <div
      className="app-shell marketing-preview-shell marketing-preview-shell--recording"
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
