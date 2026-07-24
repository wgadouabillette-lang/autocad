import clsx from "clsx";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import type { BoostedWorkspace } from "../../hooks/useBoostedWorkspaces";
import { usagePercent, useEnterpriseUsage } from "../../hooks/useUsageStatus";
import { billingApi } from "../../lib/billingApi";

interface BoostedWorkspacesListProps {
  workspaces: BoostedWorkspace[];
  onCancelled?: (workspaceId: string) => void;
}

function BoostedWorkspaceUsageRow({
  workspace,
  onCancelled,
}: {
  workspace: BoostedWorkspace;
  onCancelled?: (workspaceId: string) => void;
}) {
  const { usage, loading } = useEnterpriseUsage(workspace.workspaceId, true);
  const percent = usage ? usagePercent(usage.usedUsd, usage.allowanceUsd) : null;
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);

  const showCancelPending = workspace.cancelAtPeriodEnd || cancelRequested;
  const showCancelButton = workspace.paidByMe && workspace.canCancel && !showCancelPending;

  const handleCancel = async () => {
    const confirmed = window.confirm(
      `Annuler le renouvellement des sièges pour « ${workspace.name} » ?\n\n` +
        "L'accès IA reste actif jusqu'à la fin de la période en cours ; " +
        "aucun prélèvement ne sera fait le mois suivant.",
    );
    if (!confirmed) return;

    setCancelBusy(true);
    setCancelError(null);
    try {
      await billingApi.cancelSubscription(workspace.workspaceId);
      setCancelRequested(true);
      onCancelled?.(workspace.workspaceId);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Annulation impossible.");
    } finally {
      setCancelBusy(false);
    }
  };

  return (
    <li className="boosted-workspaces-list__item">
      <div className="boosted-workspaces-list__row">
        <span className="boosted-workspaces-list__name">{workspace.name}</span>
        <span className="boosted-workspaces-list__percent">
          {percent == null ? (loading ? "…" : "—") : `${percent}%`}
        </span>
      </div>
      <div
        className="boosted-workspaces-list__bar"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? 0}
        aria-label={
          percent == null
            ? `Usage IA pour ${workspace.name}`
            : `${percent} pour cent du pool IA utilisés`
        }
      >
        <div
          className={clsx(
            "boosted-workspaces-list__bar-fill",
            percent != null && percent >= 90 && "boosted-workspaces-list__bar-fill--warn",
            percent != null && percent >= 100 && "boosted-workspaces-list__bar-fill--full",
          )}
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>

      {workspace.paidByMe ? (
        <div className="boosted-workspaces-list__actions">
          {showCancelPending ? (
            <span className="boosted-workspaces-list__status">
              Annulation prévue — plus de renouvellement
            </span>
          ) : showCancelButton ? (
            <button
              type="button"
              className="boosted-workspaces-list__cancel"
              disabled={cancelBusy}
              onClick={() => void handleCancel()}
            >
              {cancelBusy ? "Annulation…" : "Annuler les sièges"}
            </button>
          ) : null}
          {cancelError ? (
            <p className="boosted-workspaces-list__error">{cancelError}</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Rectangle arrondi sous Entreprise — workspaces boostés + barre d'usage. */
export default function BoostedWorkspacesList({
  workspaces,
  onCancelled,
}: BoostedWorkspacesListProps) {
  if (workspaces.length === 0) return null;

  return (
    <div className="boosted-workspaces-list" role="status" aria-live="polite">
      <div className="boosted-workspaces-list__header">
        <Sparkles size={13} strokeWidth={2.25} aria-hidden />
        <span>
          {workspaces.length === 1
            ? "Workspace boosté"
            : `${workspaces.length} workspaces boostés`}
        </span>
      </div>
      <ul className="boosted-workspaces-list__items">
        {workspaces.map((workspace) => (
          <BoostedWorkspaceUsageRow
            key={workspace.workspaceId}
            workspace={workspace}
            onCancelled={onCancelled}
          />
        ))}
      </ul>
    </div>
  );
}
