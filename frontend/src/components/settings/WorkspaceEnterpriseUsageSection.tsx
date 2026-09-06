import clsx from "clsx";
import { usagePercent, useEnterpriseUsage } from "../../hooks/useUsageStatus";
import { useAuthStore } from "../../store/useAuthStore";
import { useStore } from "../../store/useStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";

/** Pool IA Team — barre + % uniquement, pour le workspace actif boosté. */
export default function WorkspaceEnterpriseUsageSection() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const settingsTab = useStore((s) => s.settingsTab);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const findWorkspace = useWorkspacesStore((s) => s.findWorkspace);

  const workspace = findWorkspace(activeRoomId);
  const workspaceName = workspace?.name ?? activeRoomId;
  const pollEnabled =
    settingsTab === "workspaces" && isAuthenticated && workspaceEnterpriseActive;
  const { usage, loading, error } = useEnterpriseUsage(activeRoomId, pollEnabled);

  if (!workspaceEnterpriseActive) return null;

  const percent = usage ? usagePercent(usage.usedUsd, usage.allowanceUsd) : null;

  return (
    <section className="settings-section settings-section--card">
      <h3 className="settings-section__label">
        AI Usage <span className="settings-section__label-sep" aria-hidden>
          |
        </span>{" "}
        {workspaceName}
      </h3>
      {loading && !usage && (
        <p className="settings-section__hint">Chargement de l&apos;usage…</p>
      )}
      {error && <p className="settings-section__hint text-red-400">{error}</p>}
      {usage && percent != null ? (
        <div className="settings-usage-summary settings-usage-summary--percent-only">
          <div className="settings-usage-summary__row settings-usage-summary__row--percent">
            <span className="settings-usage-summary__percent">{percent}%</span>
          </div>
          <div
            className="settings-usage-bar"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={`${percent} pour cent du pool IA utilisés`}
          >
            <div
              className={clsx(
                "settings-usage-bar__fill",
                percent >= 90 && "settings-usage-bar__fill--warn",
                percent >= 100 && "settings-usage-bar__fill--full",
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
