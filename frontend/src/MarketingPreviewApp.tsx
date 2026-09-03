import clsx from "clsx";
import { type CSSProperties, useEffect } from "react";
import AppChromeRow from "./components/AppChromeRow";
import BottomHeader from "./components/BottomHeader";
import CallsView from "./components/calls/CallsView";
import ChatPanelShell from "./components/ChatPanelShell";
import { useAccentColor } from "./hooks/useAccentColor";
import { useColorTheme } from "./hooks/useColorTheme";
import {
  isMarketingFollowUpPreviewScene,
  isMarketingHandoffPreviewScene,
  isMarketingNotesPreviewScene,
  isMarketingSpotifyPreviewScene,
} from "./lib/marketingPreview";
import {
  cancelMarketingPreviewHandoffDemo,
  startMarketingPreviewHandoffDemo,
} from "./lib/marketingPreviewHandoffDemo";
import {
  cancelMarketingPreviewSpotifyDemo,
  startMarketingPreviewSpotifyDemo,
} from "./lib/marketingPreviewSpotifyDemo";
import { useCallsStore } from "./store/useCallsStore";
import { useStore } from "./store/useStore";

export default function MarketingPreviewApp() {
  useColorTheme();
  useAccentColor();

  useEffect(() => {
    if (!isMarketingSpotifyPreviewScene()) return;
    startMarketingPreviewSpotifyDemo();
    return () => cancelMarketingPreviewSpotifyDemo();
  }, []);

  useEffect(() => {
    if (!isMarketingHandoffPreviewScene()) return;
    startMarketingPreviewHandoffDemo();
    return () => cancelMarketingPreviewHandoffDemo();
  }, []);

  const chatPanelOpen = useStore((s) => s.chatPanelOpen);
  const chatPanelExpanded = useStore((s) => s.chatPanelExpanded);
  const chatPanelLeaveAnimating = useStore((s) => s.chatPanelLeaveAnimating);
  const chatPanelMode = useStore((s) => s.chatPanelMode);
  const sidePanelSide = useStore((s) => s.sidePanelSide);
  const recording = useCallsStore((s) => s.recording);
  const panelOnLeft = sidePanelSide === "left";
  const chatFullscreenOverlay = chatPanelExpanded || chatPanelLeaveAnimating;
  const notesShowcase = chatPanelMode === "ai-notes" && chatPanelExpanded;

  const layoutStyle = {
    "--app-chat-col": chatPanelOpen ? "var(--forma-chat-panel-width)" : "0px",
  } as CSSProperties;

  return (
    <div
      className={clsx(
        "app-shell marketing-preview-shell",
        (isMarketingNotesPreviewScene() ||
          isMarketingHandoffPreviewScene() ||
          notesShowcase) &&
          "marketing-preview-shell--notes",
        isMarketingFollowUpPreviewScene() && "marketing-preview-shell--follow-up-static",
        recording && "marketing-preview-shell--recording",
      )}
      aria-hidden="true"
    >
      <div
        className={clsx(
          "app-layout",
          chatPanelOpen && "app-layout--chat-open",
          chatFullscreenOverlay && "app-layout--chat-fullscreen-overlay",
          panelOnLeft ? "app-layout--panel-left" : "app-layout--panel-right",
        )}
        style={layoutStyle}
      >
        <AppChromeRow />
        <main className="app-layout__main">
          <CallsView />
        </main>
        <BottomHeader />
        {chatPanelOpen ? <ChatPanelShell key={sidePanelSide} /> : null}
      </div>
      {recording ? <div className="app-recording-frame" aria-hidden /> : null}
    </div>
  );
}
