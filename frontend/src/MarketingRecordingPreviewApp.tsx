import clsx from "clsx";
import { type CSSProperties, useEffect } from "react";
import AppChromeRow from "./components/AppChromeRow";
import BottomHeader from "./components/BottomHeader";
import CallsView from "./components/calls/CallsView";
import ChatPanelShell from "./components/ChatPanelShell";
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
  const showChat = new URLSearchParams(window.location.search).get("chat") === "1";

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; radius?: number } | null;
      if (!data || data.type !== "meetra-recording-corner") return;
      const radius = Number(data.radius);
      if (!Number.isFinite(radius) || radius <= 0) return;
      document.querySelectorAll<HTMLElement>(".app-recording-frame").forEach((node) => {
        node.style.borderRadius = `0 ${radius}px ${radius}px 0`;
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const layoutStyle = {
    "--app-chat-col": showChat ? "var(--forma-chat-panel-width)" : "0px",
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
          showChat && "app-layout--chat-open",
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
        {showChat ? <ChatPanelShell /> : null}
      </div>
      <div
        className={clsx("app-recording-frame", !recording && "app-recording-frame--idle")}
        aria-hidden
      />
    </div>
  );
}
