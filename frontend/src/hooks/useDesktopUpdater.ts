import { useEffect, useState } from "react";
import { hasFormaDesktop } from "../lib/formaDesktop";
import { useNotificationsStore } from "../store/useNotificationsStore";

export type DesktopUpdateGate = {
  /** 0–100 while a desktop update is downloading/installing; null otherwise. */
  progress: number | null;
  /** Keep the splash/loading overlay until the current update reaches 100% (or installs). */
  blockingUpdate: boolean;
  /** First packaged update check finished (or skipped in dev). */
  startupCheckComplete: boolean;
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function useDesktopUpdater(): DesktopUpdateGate {
  const push = useNotificationsStore((s) => s.push);
  const openPanel = useNotificationsStore((s) => s.openPanel);
  const removeNotification = useNotificationsStore((s) => s.removeNotification);
  const [progress, setProgress] = useState<number | null>(null);
  const [blockingUpdate, setBlockingUpdate] = useState(false);
  const [startupCheckComplete, setStartupCheckComplete] = useState(() => !hasFormaDesktop());

  useEffect(() => {
    if (!hasFormaDesktop() || !window.formaDesktop?.onUpdateAvailable) {
      setStartupCheckComplete(true);
      return;
    }

    const desktop = window.formaDesktop;
    let cancelled = false;
    let unblockAtHundred: number | undefined;
    let pollId: number | undefined;

    const applyProgress = async (percent: number) => {
      const next = clampPercent(percent);
      setProgress(next);
      if (next < 100) {
        setBlockingUpdate(true);
        return;
      }
      const state = await desktop.getUpdateState?.();
      if (cancelled) return;
      if (state?.installing) {
        setBlockingUpdate(true);
        return;
      }
      // Download reached 100% without an in-progress install (e.g. “tonight” pre-download).
      window.clearTimeout(unblockAtHundred);
      unblockAtHundred = window.setTimeout(() => {
        if (!cancelled) setBlockingUpdate(false);
      }, 200);
    };

    const syncFromMain = async () => {
      if (!desktop.getUpdateState) {
        setStartupCheckComplete(true);
        return;
      }
      const state = await desktop.getUpdateState();
      if (cancelled || !state) return;
      if (state.progress && typeof state.progress.percent === "number") {
        await applyProgress(state.progress.percent);
      } else if (state.installing) {
        setBlockingUpdate(true);
        setProgress((current) => current ?? 0);
      }
      if (state.startupCheckComplete) {
        setStartupCheckComplete(true);
        const downloadOpen =
          state.installing ||
          (state.progress != null && state.progress.percent < 100);
        if (!downloadOpen && pollId !== undefined) {
          window.clearInterval(pollId);
          pollId = undefined;
        }
      }
    };

    const unsubAvailable = desktop.onUpdateAvailable?.((info) => {
      const items = useNotificationsStore.getState().items;
      const already = items.some(
        (n) => n.kind === "app_update" && n.updateVersion === info.version,
      );
      if (already) return;

      push({
        kind: "app_update",
        category: "Mise à jour",
        title: `Meetra ${info.version} est disponible`,
        body:
          info.releaseNotes?.trim() ||
          "Une nouvelle version de l'application est prête à être installée.",
        updateVersion: info.version,
        updateReleaseNotes: info.releaseNotes,
      });
      openPanel();
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
      void applyProgress(payload.percent);
    });

    const unsubInstalled = desktop.onUpdateInstalled?.((info) => {
      window.clearTimeout(unblockAtHundred);
      setProgress(100);
      // Packaged builds quitAndInstall after this event; keep the 100% bar until restart.
      if (info.dev) setBlockingUpdate(false);
    });

    void syncFromMain();
    pollId = window.setInterval(() => {
      void syncFromMain();
    }, 400);
    const giveUp = window.setTimeout(() => {
      setStartupCheckComplete(true);
    }, 20_000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      window.clearTimeout(giveUp);
      window.clearTimeout(unblockAtHundred);
      unsubAvailable?.();
      unsubScheduled?.();
      unsubProgress?.();
      unsubInstalled?.();
    };
  }, [push, openPanel, removeNotification]);

  return { progress, blockingUpdate, startupCheckComplete };
}
