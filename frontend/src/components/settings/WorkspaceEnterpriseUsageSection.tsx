import UsageMeter from "./UsageMeter";
import { useEnterpriseUsage } from "../../hooks/useUsageStatus";
import { useAuthStore } from "../../store/useAuthStore";
import { useStore } from "../../store/useStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";

/** Pool IA Entreprise — visible par tous les membres du workspace actif. */
export default function WorkspaceEnterpriseUsageSection() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const settingsTab = useStore((s) => s.settingsTab);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const findWorkspace = useWorkspacesStore((s) => s.findWorkspace);

  const workspace = findWorkspace(activeRoomId);
  const pollEnabled =
    settingsTab === "workspaces" && isAuthenticated && workspaceEnterpriseActive;
  const { usage, loading, error } = useEnterpriseUsage(activeRoomId, pollEnabled);

  if (!workspaceEnterpriseActive) return null;

  return (
    <section className="settings-section settings-section--card">
      <h3 className="settings-section__label">Consommation IA — workspace</h3>
      <p className="settings-section__hint">
        Pool partagé pour <strong>{workspace?.name ?? activeRoomId}</strong> — visible par tous
        les membres. Facturé au tarif Lyte, modèle par modèle.
      </p>
      {loading && !usage && (
        <p className="settings-section__hint">Chargement de l&apos;usage…</p>
      )}
      {error && <p className="settings-section__hint text-red-400">{error}</p>}
      {usage && (
        <UsageMeter
          usage={usage}
          showPercentProminent
          compact
          subtitle="Pourcentage mis à jour au fil de l'utilisation par l'équipe."
        />
      )}
    </section>
  );
}
