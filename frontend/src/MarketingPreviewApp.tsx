import clsx from "clsx";
import { type CSSProperties } from "react";
import AppChromeRow from "./components/AppChromeRow";
import BottomHeader from "./components/BottomHeader";
import CallsView from "./components/calls/CallsView";
import ChatPanelShell from "./components/ChatPanelShell";
import { useAccentColor } from "./hooks/useAccentColor";
import { useColorTheme } from "./hooks/useColorTheme";
import { useStore } from "./store/useStore";

export default function MarketingPreviewApp() {
  useColorTheme();
  useAccentColor();

  const chatPanelOpen = useStore((s) => s.chatPanelOpen);
  const sidePanelSide = useStore((s) => s.sidePanelSide);
  const panelOnLeft = sidePanelSide === "left";

  const layoutStyle = {
    "--app-chat-col": chatPanelOpen ? "var(--forma-chat-panel-width)" : "0px",
  } as CSSProperties;

  return (
    <div className="app-shell marketing-preview-shell" aria-hidden="true">
      <div
        className={clsx(
          "app-layout",
          chatPanelOpen && "app-layout--chat-open",
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
