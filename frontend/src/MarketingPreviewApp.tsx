import clsx from "clsx";
import { type CSSProperties } from "react";
import AppChromeRow from "./components/AppChromeRow";
import BottomHeader from "./components/BottomHeader";
import CallsView from "./components/calls/CallsView";
import ChatPanelShell from "./components/ChatPanelShell";
import { useColorTheme } from "./hooks/useColorTheme";
import { useMarketingPreviewCycle } from "./hooks/useMarketingPreviewCycle";
import { useStore } from "./store/useStore";

export default function MarketingPreviewApp() {
  useColorTheme();
  useMarketingPreviewCycle();

  const chatPanelOpen = useStore((s) => s.chatPanelOpen);
  const sidePanelSide = useStore((s) => s.sidePanelSide);

  const layoutStyle = {
    "--app-chat-col": chatPanelOpen ? "var(--forma-chat-panel-width)" : "0px",
  } as CSSProperties;

  return (
    <div className="app-shell marketing-preview-shell" aria-hidden="true">
      <div
        className={clsx(
          "app-layout",
          chatPanelOpen && "app-layout--chat-open",
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
        {chatPanelOpen ? <ChatPanelShell key={sidePanelSide} /> : null}
      </div>
    </div>
  );
}
