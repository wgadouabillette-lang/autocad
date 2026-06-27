import { useEffect } from "react";
import { chatPanelModeTabs } from "../lib/chatPanelModes";
import {
  isMarketingPreview,
  MARKETING_PREVIEW_NOTE_ID,
} from "../lib/marketingPreview";
import type { ChatPanelMode } from "../lib/voiceAssistPanel";
import { useStore } from "../store/useStore";

const TAB_CYCLE_MS = 12000;
const IDLE_BEFORE_RESUME_MS = 12000;

function applyPreviewPanelMode(mode: ChatPanelMode): void {
  if (mode === "ai-notes") {
    useStore.setState({
      activeManualNoteId: MARKETING_PREVIEW_NOTE_ID,
      showChatHistory: false,
    });
    return;
  }

  if (mode === "agent") {
    useStore.setState({ showChatHistory: false });
  }
}

function isPreviewInteractiveControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (
    target.closest(".chat-panel-mode-tabs__btn") ||
    target.closest(".chat-tab-btn") ||
    target.closest(".chat-tab-back")
  ) {
    return true;
  }
  const bottomBtn = target.closest(".app-bottom-header .bottom-bar-btn");
  return (
    bottomBtn instanceof Element &&
    !bottomBtn.classList.contains("marketing-preview-locked")
  );
}

export function useMarketingPreviewCycle() {
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);

  useEffect(() => {
    if (!isMarketingPreview()) return;

    const modes = chatPanelModeTabs(
      subscriptionPlan,
      false,
      billingManaged,
      workspaceEnterpriseActive,
    ).map((tab) => tab.id);

    if (modes.length === 0) return;

    let index = 0;
    let intervalId: number | null = null;
    let idleTimerId: number | null = null;
    let paused = false;

    const syncIndexAfterCurrentMode = () => {
      const current = useStore.getState().chatPanelMode;
      const currentIdx = modes.indexOf(current);
      index = currentIdx >= 0 ? (currentIdx + 1) % modes.length : 0;
    };

    const stopInterval = () => {
      if (intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };

    const tick = () => {
      if (paused) return;
      const mode = modes[index];
      useStore.getState().switchChatPanelMode(mode);
      applyPreviewPanelMode(mode);
      index = (index + 1) % modes.length;
    };

    const startInterval = () => {
      if (intervalId !== null) return;
      syncIndexAfterCurrentMode();
      intervalId = window.setInterval(tick, TAB_CYCLE_MS);
    };

    const scheduleResume = () => {
      if (idleTimerId !== null) window.clearTimeout(idleTimerId);
      idleTimerId = window.setTimeout(() => {
        paused = false;
        idleTimerId = null;
        startInterval();
      }, IDLE_BEFORE_RESUME_MS);
    };

    const pauseForUser = () => {
      paused = true;
      stopInterval();
      window.setTimeout(() => {
        applyPreviewPanelMode(useStore.getState().chatPanelMode);
      }, 0);
      scheduleResume();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!isPreviewInteractiveControl(event.target)) return;
      pauseForUser();
    };

    tick();
    startInterval();
    document.addEventListener("pointerdown", onPointerDown, true);

    return () => {
      stopInterval();
      if (idleTimerId !== null) window.clearTimeout(idleTimerId);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [subscriptionPlan, billingManaged, workspaceEnterpriseActive]);
}
