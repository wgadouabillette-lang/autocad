import { useEffect, useState } from "react";
import { hasFormaDesktop } from "../lib/formaDesktop";
import { useNotificationsStore } from "../store/useNotificationsStore";

export type DesktopUpdateGate = {
  /** 0–100 while a confirmed update is downloading/installing; null otherwise. */
  progress: number | null;
  /** Overlay only after the user accepts an update (Maintenant). Never blocks boot. */
  blockingUpdate: boolean;
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function notifyUpdateAvailable(info: { version: string; releaseNotes?: string }) {
  const store = useNotificationsStore.getState();
  const already = store.items.some(
    (n) => n.kind === "app_update" && n.updateVersion === info.version,
  );
  if (already) return;

  store.push({
    kind: "app_update",
    category: "Mise à jour",
    title: "A new version of Meetra is available",
    body:
      info.releaseNotes?.trim() ||
      "Install when you are ready. Meetra will download the update and restart after you confirm.",
    updateVersion: info.version,
    updateReleaseNotes: info.releaseNotes,
  });
  store.openPanel();
}

export function useDesktopUpdater(): DesktopUpdateGate {
  const push = useNotificationsStore((s) => s.push);
  const removeNotification = useNotificationsStore((s) => s.removeNotification);
  const [progress, setProgress] = useState<number | null>(null);
  const [blockingUpdate, setBlockingUpdate] = useState(false);

  useEffect(() => {
    if (!hasFormaDesktop() || !window.formaDesktop?.onUpdateAvailable) {
      return;
    }

    const desktop = window.formaDesktop;
    let cancelled = false;
    let pollId: number | undefined;

    const applyInstallProgress = (percent: number, installing: boolean) => {
      if (!installing) {
        setBlockingUpdate(false);
        setProgress(null);
        return;
      }
      setProgress(clampPercent(percent));
      setBlockingUpdate(true);
    };

    const syncFromMain = async () => {
      if (!desktop.getUpdateState) return;
      const state = await desktop.getUpdateState();
      if (cancelled || !state) return;
      if (state.available && !state.pendingTonight) {
        notifyUpdateAvailable(state.available);
      }
      if (state.installing) {
        applyInstallProgress(state.progress?.percent ?? 0, true);
      } else {
        applyInstallProgress(0, false);
      }
      if (state.startupCheckComplete && !state.installing && pollId !== undefined) {
        window.clearInterval(pollId);
        pollId = undefined;
      }
    };

    const unsubAvailable = desktop.onUpdateAvailable?.((info) => {
      notifyUpdateAvailable(info);
    });

    const unsubScheduled = desktop.onUpdateScheduledTonight?.((info) => {
      const items = useNotificationsStore.getState().items;
      const match = items.find(
        (n) => n.kind === "app_update" && n.updateVersion === info.version,
      );
      if (match) removeNotification(match.id);

      push({
        kind: "new_feature",
        category: "Mise à jour",
        title: "Mise à jour prévue cette nuit",
        body: `Meetra ${info.version} s'installera entre ${info.window}.`,
      });
    });

    const unsubProgress = desktop.onUpdateProgress?.((payload) => {
      void (async () => {
        const state = await desktop.getUpdateState?.();
        if (cancelled) return;
        applyInstallProgress(payload.percent, Boolean(state?.installing));
      })();
    });

    const unsubInstalled = desktop.onUpdateInstalled?.((info) => {
      setProgress(100);
      setBlockingUpdate(true);
      // Packaged builds quitAndInstall after this event; keep the 100% bar until restart.
      if (info.dev) setBlockingUpdate(false);
    });

    void syncFromMain();
    pollId = window.setInterval(() => {
      void syncFromMain();
    }, 400);
    const giveUp = window.setTimeout(() => {
      if (pollId !== undefined) {
        window.clearInterval(pollId);
        pollId = undefined;
      }
    }, 20_000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      window.clearTimeout(giveUp);
      unsubAvailable?.();
      unsubScheduled?.();
      unsubProgress?.();
      unsubInstalled?.();
    };
  }, [push, removeNotification]);

  return { progress, blockingUpdate };
}
