import { useEffect } from "react";
import {
  isMarketingPreview,
  readMarketingPreviewSceneParam,
} from "../lib/marketingPreview";
import { useStore } from "../store/useStore";

const CONNECTORS_TAB_ID = "preview-chat-connectors";

export function useMarketingConnectorsSectionPreview(): void {
  useEffect(() => {
    if (!isMarketingPreview()) return;
    if (readMarketingPreviewSceneParam() !== "connectors") return;

    const { openChatTabs } = useStore.getState();
    const connectorsTab = openChatTabs.find((tab) => tab.id === CONNECTORS_TAB_ID);

    useStore.setState({
      chatPanelOpen: true,
      chatPanelMode: "agent",
      chatPanelExpanded: false,
      sidePanelSide: "right",
      showChatHistory: false,
      ...(connectorsTab
        ? {
            activeChatTabId: connectorsTab.id,
            chat: structuredClone(connectorsTab.messages),
          }
        : {}),
    });
  }, []);
}
