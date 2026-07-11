import clsx from "clsx";
import { type CSSProperties } from "react";
import ChatPanelShell from "./components/ChatPanelShell";
import { useColorTheme } from "./hooks/useColorTheme";
import { useMarketingConnectorsSectionPreview } from "./hooks/useMarketingConnectorsSectionPreview";
import { readMarketingPreviewConnectorsActiveParam } from "./lib/marketingPreview";
import { useStore } from "./store/useStore";

export default function MarketingConnectorsPreviewApp() {
  useColorTheme();
  useMarketingConnectorsSectionPreview();

  const sidePanelSide = useStore((s) => s.sidePanelSide);
  const connectorsStatic = readMarketingPreviewConnectorsActiveParam();

  const layoutStyle = {
    "--app-chat-col": "100%",
  } as CSSProperties;

  return (
    <div
      className={clsx(
        "app-shell marketing-preview-shell marketing-preview-shell--connectors-section",
        connectorsStatic && "marketing-preview-shell--connectors-static",
      )}
      aria-hidden="true"
    >
      <div
        className={clsx(
          "app-layout",
          "app-layout--chat-open",
          "marketing-preview-connectors-layout",
          sidePanelSide === "left" && "app-layout--panel-left",
        )}
        style={layoutStyle}
      >
        <ChatPanelShell key={sidePanelSide} />
      </div>
    </div>
  );
}
