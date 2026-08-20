import clsx from "clsx";
import { type CSSProperties } from "react";
import AppChromeRow from "./components/AppChromeRow";
import BottomHeader from "./components/BottomHeader";
import CallsView from "./components/calls/CallsView";
import ChatPanelShell from "./components/ChatPanelShell";
import { useAccentColor } from "./hooks/useAccentColor";
import { useColorTheme } from "./hooks/useColorTheme";
import {
  isMarketingHandoffPreviewScene,
  isMarketingNotesPreviewScene,
} from "./lib/marketingPreview";
import { useStore } from "./store/useStore";

export default function MarketingPreviewApp() {
  useColorTheme();
  useAccentColor();

  const chatPanelOpen = useStore((s) => s.chatPanelOpen);
  const chatPanelExpanded = useStore((s) => s.chatPanelExpanded);
  const chatPanelLeaveAnimating = useStore((s) => s.chatPanelLeaveAnimating);
  const sidePanelSide = useStore((s) => s.sidePanelSide);
  const panelOnLeft = sidePanelSide === "left";
  const chatFullscreenOverlay = chatPanelExpanded || chatPanelLeaveAnimating;

  const layoutStyle = {
    "--app-chat-col": chatPanelOpen ? "var(--forma-chat-panel-width)" : "0px",
  } as CSSProperties;

  return (
    <div
      className={clsx(
        "app-shell marketing-preview-shell",
        (isMarketingNotesPreviewScene() || isMarketingHandoffPreviewScene()) &&
          "marketing-preview-shell--notes",
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
    </div>
  );
}
