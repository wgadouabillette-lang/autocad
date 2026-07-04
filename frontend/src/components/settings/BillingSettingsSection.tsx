import { useState } from "react";
import { useBillingSummary } from "../../hooks/useBillingSummary";
import { billingApi } from "../../lib/billingApi";
import { useAuthStore } from "../../store/useAuthStore";
import { useStore } from "../../store/useStore";

function formatBillingDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("fr-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function BillingSettingsSection() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setSubscriptionPlan = useStore((s) => s.setSubscriptionPlan);
  const { summary, loading, error, reload } = useBillingSummary();
  const [cancelBusy, setCancelBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);

  const hasPaidPlan = summary?.currentPlan === "pro" || summary?.currentPlan === "enterprise";
  const canCancel =
    hasPaidPlan &&
    summary?.billingManaged &&
    !summary.cancelAtPeriodEnd &&
    !cancelRequested;

  const handleCancel = async () => {
    if (!summary || !canCancel) return;
    const confirmed = window.confirm(
      summary.currentPlan === "enterprise"
        ? "Annuler l'abonnement Entreprise à la fin de la période en cours ?"
        : "Annuler l'abonnement Pro à la fin de la période en cours ?",
    );
    if (!confirmed) return;

    setCancelBusy(true);
    setActionError(null);
    try {
      if (summary.currentPlan === "pro") {
        setSubscriptionPlan("free");
        setCancelRequested(true);
        await reload();
        return;
      }
      setActionError("L'annulation Entreprise n'est pas disponible pour le moment.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Annulation impossible.");
    } finally {
      setCancelBusy(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <section className="settings-section settings-section--card">
        <p className="settings-section__hint">
          Connectez-vous pour consulter votre forfait et la date de prochain prélèvement.
        </p>
      </section>
    );
  }

  return (
    <section className="settings-section settings-section--card">
      <h3 className="settings-section__label">Forfait actuel</h3>
      {loading && !summary ? <p className="settings-section__hint">Chargement…</p> : null}
      {(error || actionError) && (
        <p className="settings-section__hint text-red-400">{actionError ?? error}</p>
      )}
      {summary ? (
        <>
          <dl className="settings-kv">
            <div className="settings-kv__row">
              <dt>Forfait</dt>
              <dd>{summary.planLabel}</dd>
            </div>
            {summary.workspaceName ? (
              <div className="settings-kv__row">
                <dt>Workspace</dt>
                <dd>{summary.workspaceName}</dd>
              </div>
            ) : null}
            <div className="settings-kv__row">
              <dt>Prochain prélèvement</dt>
              <dd>{formatBillingDate(summary.nextBillingDate)}</dd>
            </div>
            {summary.cancelAtPeriodEnd || cancelRequested ? (
              <div className="settings-kv__row">
                <dt>Statut</dt>
                <dd className="text-amber-300">Annulation prévue en fin de période</dd>
              </div>
            ) : null}
          </dl>
          {canCancel ? (
            <div className="settings-section__stack mt-4">
              <button
                type="button"
                className="settings-option settings-option--danger"
                disabled={cancelBusy}
                onClick={() => void handleCancel()}
              >
                <span className="settings-option__title">Annuler l&apos;abonnement</span>
                <span className="settings-option__subtitle">
                  L&apos;accès reste actif jusqu&apos;à la fin de la période en cours.
                </span>
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
