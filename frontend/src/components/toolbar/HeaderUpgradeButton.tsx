import { ArrowUpCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { watchSharedWorkspaceDoc, watchWorkspaceMembers } from "../../lib/firebase/workspaceRegistry";
import { isMarketingPreview } from "../../lib/marketingPreview";
import {
  loadWorkspaceSeatCounts,
  type WorkspaceSeatCounts,
} from "../../lib/workspaceInviteSeats";
import { useAuthStore } from "../../store/useAuthStore";
import { useStore } from "../../store/useStore";
import { useWorkspaceUpgradeStore } from "../../store/useWorkspaceUpgradeStore";
import { workspaceLabel, useWorkspacesStore } from "../../store/useWorkspacesStore";

/** Capsule Upgrade, à gauche du bouton Workspace. Toujours visible. */
export default function HeaderUpgradeButton() {
  const { t } = useTranslation();
  const openUpgrade = useWorkspaceUpgradeStore((s) => s.openUpgrade);
  const upgradeOpen = useWorkspaceUpgradeStore((s) => s.open);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const workspace = useWorkspacesStore((s) => s.findWorkspace(activeRoomId));
  const workspaceName = workspace?.name ?? workspaceLabel(activeRoomId);
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const label = t("onboarding.upgrade.button");
  const [seats, setSeats] = useState<WorkspaceSeatCounts | null>(null);

  useEffect(() => {
    const workspaceId = (workspace?.id ?? activeRoomId).trim();
    if (!workspaceId || !isAuthenticated) {
      setSeats(null);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      void loadWorkspaceSeatCounts(workspaceId).then((counts) => {
        if (!cancelled) setSeats(counts);
      });
    };
    refresh();
    const normalized = workspaceId.toLowerCase();
    const unsubMembers = watchWorkspaceMembers(normalized, refresh, refresh);
    const unsubWorkspace = watchSharedWorkspaceDoc(normalized, refresh, refresh);
    return () => {
      cancelled = true;
      unsubMembers();
      unsubWorkspace();
    };
  }, [activeRoomId, billingManaged, isAuthenticated, subscriptionPlan, workspace?.id]);

  const seatLabel = seats ? `${seats.filled}/${seats.capacity}` : null;

  return (
    <button
      type="button"
      className={upgradeOpen ? "header-upgrade-capsule is-active" : "header-upgrade-capsule"}
      title={label}
      aria-label={
        workspaceName
          ? `${label}${seatLabel ? ` ${seatLabel}` : ""} — ${workspaceName}`
          : seatLabel
            ? `${label} ${seatLabel}`
            : label
      }
      aria-haspopup="dialog"
      aria-expanded={upgradeOpen}
      onClick={() => {
        if (isMarketingPreview() || !isAuthenticated) return;
        openUpgrade();
      }}
    >
      <ArrowUpCircle className="header-upgrade-capsule__icon" size={13} strokeWidth={2} aria-hidden />
      <span className="header-upgrade-capsule__label">{label}</span>
      {seatLabel ? <span className="header-upgrade-capsule__seats">{seatLabel}</span> : null}
    </button>
  );
}
