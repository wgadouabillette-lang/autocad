import { useEffect } from "react";
import { hasFormaDesktop } from "../lib/formaDesktop";
import { useNotificationsStore } from "../store/useNotificationsStore";

export function useDesktopUpdater() {
  const push = useNotificationsStore((s) => s.push);
  const openPanel = useNotificationsStore((s) => s.openPanel);
  const removeNotification = useNotificationsStore((s) => s.removeNotification);

  useEffect(() => {
    if (!hasFormaDesktop() || !window.formaDesktop?.onUpdateAvailable) return;

    const unsubAvailable = window.formaDesktop.onUpdateAvailable((info) => {
      const items = useNotificationsStore.getState().items;
      const already = items.some(
        (n) => n.kind === "app_update" && n.updateVersion === info.version,
      );
      if (already) return;

      push({
        kind: "app_update",
        category: "Mise à jour",
        title: `Lyte ${info.version} est disponible`,
        body:
          info.releaseNotes?.trim() ||
          "Une nouvelle version de l'application est prête à être installée.",
        updateVersion: info.version,
        updateReleaseNotes: info.releaseNotes,
      });
      openPanel();
    });

    const unsubScheduled = window.formaDesktop.onUpdateScheduledTonight?.((info) => {
      const items = useNotificationsStore.getState().items;
      const match = items.find(
        (n) => n.kind === "app_update" && n.updateVersion === info.version,
      );
      if (match) removeNotification(match.id);

      push({
        kind: "new_feature",
        category: "Mise à jour",
        title: "Mise à jour prévue cette nuit",
        body: `Lyte ${info.version} s'installera entre ${info.window}.`,
      });
    });

    return () => {
      unsubAvailable();
      unsubScheduled?.();
    };
  }, [push, openPanel, removeNotification]);
}
