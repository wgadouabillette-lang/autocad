import { useNotificationsStore } from "../store/useNotificationsStore";
import { useStore } from "../store/useStore";
import { useWorkspaceOverlayStore } from "../store/useWorkspaceOverlayStore";

export type BottomPanel = "notifications" | "calendar" | "workspace";
export type SidePanel = BottomPanel | "chat";

const LEFT_PANELS: BottomPanel[] = ["notifications", "workspace"];

function closeBottomPanel(panel: BottomPanel) {
  switch (panel) {
    case "notifications":
      useNotificationsStore.getState().closePanel();
      break;
    case "workspace":
      useWorkspaceOverlayStore.getState().closePanel();
      break;
    case "calendar":
      break;
  }
}

/**
 * Un seul panneau actif par côté, mais gauche + droite peuvent être ouverts en même temps.
 * Gauche : notifications, workspace. Droite : panneau unifié (agent / calendrier).
 */
export function closePanelsOnSide(side: "left" | "right", keep?: SidePanel) {
  if (side === "left") {
    for (const panel of LEFT_PANELS) {
      if (panel !== keep) closeBottomPanel(panel);
    }
    return;
  }

  if (keep !== "chat" && keep !== "calendar") {
    useStore.getState().closeChatPanel();
  }
}

/** @deprecated Use closePanelsOnSide */
export function closeOtherBottomPanels(keep?: BottomPanel) {
  if (!keep) {
    closePanelsOnSide("left");
    closePanelsOnSide("right");
    return;
  }
  const side = LEFT_PANELS.includes(keep) ? "left" : "right";
  closePanelsOnSide(side, keep);
}
