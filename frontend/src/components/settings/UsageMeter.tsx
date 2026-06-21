import clsx from "clsx";
import type { UsageStatus } from "../../lib/billingApi";
import { usagePercent } from "../../hooks/useUsageStatus";

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

interface UsageMeterProps {
  usage: UsageStatus;
  title?: string;
  subtitle?: string;
  /** Affiche le pourcentage en grand (Plan Pro ou pool workspace). */
  showPercentProminent?: boolean;
  /** Masque le détail tarifs / par modèle (onglet Workspaces). */
  compact?: boolean;
  /** Affiche les lignes en dollars (Utilisé / Restant). */
  showAmounts?: boolean;
  /** Affiche la ligne "Tokens (entrée + sortie)". */
  showTokens?: boolean;
  /** Affiche les messages d'avertissement (quota épuisé, etc.). */
  showWarning?: boolean;
}

export default function UsageMeter({
  usage,
  title,
  subtitle,
  showPercentProminent = false,
  compact = false,
  showAmounts = true,
  showTokens = true,
  showWarning = true,
}: UsageMeterProps) {
  const percent = usagePercent(usage.usedUsd, usage.allowanceUsd);
  const isEnterprise = usage.scope === "enterprise";

  return (
    <>
      {title && <p className="settings-section__label">{title}</p>}
      {subtitle && <p className="settings-section__hint">{subtitle}</p>}

      {showPercentProminent && (
        <div
          className="settings-usage-percent"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={`${percent} pour cent du quota IA utilisé`}
        >
          <span className="settings-usage-percent__value">{percent}%</span>
          <span className="settings-usage-percent__label">
            {isEnterprise ? "du pool workspace utilisé" : "de votre quota Pro utilisé"}
          </span>
        </div>
      )}

      <div className="settings-usage-summary">
        {showAmounts && (
          <div className="settings-usage-summary__row">
            <span>Utilisé</span>
            <strong>
              {formatUsd(usage.usedUsd)} / {formatUsd(usage.allowanceUsd)}
              {!showPercentProminent && ` (${percent}%)`}
            </strong>
          </div>
        )}
        <div className="settings-usage-bar" aria-hidden={showPercentProminent}>
          <div
            className={clsx(
              "settings-usage-bar__fill",
              percent >= 90 && "settings-usage-bar__fill--warn",
              percent >= 100 && "settings-usage-bar__fill--full",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        {!compact && showAmounts && (
          <div className="settings-usage-summary__row settings-usage-summary__row--muted">
            <span>Restant</span>
            <span>{formatUsd(Math.max(0, usage.remainingUsd))}</span>
          </div>
        )}
        {!compact && showTokens && (
          <div className="settings-usage-summary__row settings-usage-summary__row--muted">
            <span>Tokens (entrée + sortie)</span>
            <span>{usage.totalTokens.toLocaleString()}</span>
          </div>
        )}
        {isEnterprise && usage.seatCount != null && (
          <div className="settings-usage-summary__row settings-usage-summary__row--muted">
            <span>Sièges facturés</span>
            <span>
              {usage.seatCount}
              {usage.memberCount != null ? ` · ${usage.memberCount} membres` : ""}
            </span>
          </div>
        )}
        {showWarning && !isEnterprise && usage.remainingUsd <= 0 && (
          <p className="settings-section__hint text-amber-300">
            Quota épuisé — attendez le renouvellement.
          </p>
        )}
        {showWarning && isEnterprise && usage.remainingUsd <= 0 && (
          <p className="settings-section__hint text-amber-300">
            Pool workspace épuisé — le propriétaire peut augmenter les sièges ou attendre le
            renouvellement.
          </p>
        )}
      </div>
    </>
  );
}
