import clsx from "clsx";
import type { UsageStatus } from "../../lib/billingApi";
import { onDemandPercent, usagePercent } from "../../hooks/useUsageStatus";

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
}

export default function UsageMeter({
  usage,
  title,
  subtitle,
  showPercentProminent = false,
  compact = false,
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
        <div className="settings-usage-summary__row">
          <span>Utilisé</span>
          <strong>
            {formatUsd(usage.usedUsd)} / {formatUsd(usage.allowanceUsd)}
            {!showPercentProminent && ` (${percent}%)`}
          </strong>
        </div>
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
        {!compact && (
          <>
            <div className="settings-usage-summary__row settings-usage-summary__row--muted">
              <span>Restant</span>
              <span>{formatUsd(Math.max(0, usage.remainingUsd))}</span>
            </div>
            <div className="settings-usage-summary__row settings-usage-summary__row--muted">
              <span>Tokens (entrée + sortie)</span>
              <span>{usage.totalTokens.toLocaleString()}</span>
            </div>
          </>
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
        {!isEnterprise && usage.onDemandEnabled && (
          <>
            <p className="settings-section__hint">
              Usage à la demande activé — tarif hors forfait ×
              {(usage.onDemandMarkupMultiplier ?? 1.65).toFixed(2)} (forfait ×
              {usage.markupMultiplier.toFixed(2)}).
            </p>
            {usage.onDemandLimitUsd != null ? (
              <div className="settings-usage-summary__row settings-usage-summary__row--muted">
                <span>À la demande (hors forfait)</span>
                <span>
                  ${(usage.onDemandUsedUsd ?? 0).toFixed(2)} / ${usage.onDemandLimitUsd.toFixed(2)}
                  {" "}
                  ({onDemandPercent(usage.onDemandUsedUsd ?? 0, usage.onDemandLimitUsd)}%)
                </span>
              </div>
            ) : (
              <div className="settings-usage-summary__row settings-usage-summary__row--muted">
                <span>À la demande (hors forfait)</span>
                <span>${(usage.onDemandUsedUsd ?? 0).toFixed(2)} · illimité</span>
              </div>
            )}
          </>
        )}
        {!isEnterprise && !usage.onDemandEnabled && usage.remainingUsd <= 0 && (
          <p className="settings-section__hint text-amber-300">
            Quota épuisé — activez l&apos;usage à la demande ci-dessous ou attendez le
            renouvellement.
          </p>
        )}
        {isEnterprise && usage.remainingUsd <= 0 && (
          <p className="settings-section__hint text-amber-300">
            Pool workspace épuisé — le propriétaire peut augmenter les sièges ou attendre le
            renouvellement.
          </p>
        )}
        {!isEnterprise && usage.onDemandEnabled && usage.onDemandLimitUsd != null && (usage.onDemandRemainingUsd ?? 0) <= 0 && usage.remainingUsd <= 0 && (
          <p className="settings-section__hint text-amber-300">
            Plafond à la demande atteint — augmentez la limite ci-dessous ou attendez le
            renouvellement.
          </p>
        )}
      </div>

      {!compact && usage.modelRates.length > 0 && (
        <details className="settings-usage-rates">
          <summary>Tarifs Lyte par modèle (USD / 1M tokens)</summary>
          <ul className="settings-usage-rates__list">
            {usage.modelRates.map((rate) => (
              <li key={rate.modelKey}>
                <code>{rate.label || rate.modelKey}</code>
                <span>
                  forfait in {formatUsd(rate.retailInputUsdPer1M)} · out{" "}
                  {formatUsd(rate.retailOutputUsdPer1M)}
                </span>
                {usage.onDemandEnabled && (
                  <span>
                    on-demand in {formatUsd(rate.onDemandInputUsdPer1M)} · out{" "}
                    {formatUsd(rate.onDemandOutputUsdPer1M)}
                  </span>
                )}
                <span className="settings-usage-rates__provider">
                  fourn. in {formatUsd(rate.providerInputUsdPer1M)} · out{" "}
                  {formatUsd(rate.providerOutputUsdPer1M)}
                </span>
              </li>
            ))}
          </ul>
          <p className="settings-section__hint">
            Forfait ×{usage.markupMultiplier.toFixed(2)}
            {usage.onDemandEnabled
              ? ` · à la demande ×${(usage.onDemandMarkupMultiplier ?? 1.65).toFixed(2)}`
              : ""}{" "}
            — entrée / sortie séparées par modèle.
          </p>
        </details>
      )}

      {!compact && (usage.usageByModel?.length ?? 0) > 0 && (
        <details className="settings-usage-rates mt-3" open>
          <summary>Consommation par modèle ce mois-ci</summary>
          <ul className="settings-usage-rates__list">
            {usage.usageByModel!.map((row) => (
              <li key={row.modelKey}>
                <code>{row.label || row.modelKey}</code>
                <span>{formatUsd(row.usedUsd)}</span>
                <span className="settings-usage-rates__provider">
                  {row.inputTokens.toLocaleString()} in · {row.outputTokens.toLocaleString()} out
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
