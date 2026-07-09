import { useEffect } from "react";
import { matchAppShortcut } from "../lib/keyboardShortcuts";
import { triggerHallDjSkipFromShortcut } from "../lib/hallDjSkipShortcut";
import { useCallsStore } from "../store/useCallsStore";
import { useStore } from "../store/useStore";

export function useAppKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;

      const shortcut = matchAppShortcut(event);
      if (!shortcut) return;

      event.preventDefault();

      if (shortcut === "mute") {
        void useCallsStore.getState().toggleMuted();
        return;
      }

      if (shortcut === "recording") {
        void useCallsStore.getState().toggleRecording();
        return;
      }

      if (shortcut === "djSkip") {
        triggerHallDjSkipFromShortcut();
        return;
      }

      if (shortcut === "panel") {
        useStore.getState().cycleChatPanelMode();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
