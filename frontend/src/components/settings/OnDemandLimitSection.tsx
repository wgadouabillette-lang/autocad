import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";
import type { UsageStatus } from "../../lib/billingApi";
import { onDemandPercent } from "../../hooks/useUsageStatus";

const PRESETS = [10, 25, 50] as const;

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

interface OnDemandLimitSectionProps {
  usage: UsageStatus | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  onSetLimit: (limitUsd: number | null) => Promise<void>;
}

export default function OnDemandLimitSection({
  usage,
  loading,
  saving,
  error,
  onSetLimit,
}: OnDemandLimitSectionProps) {
  const currentLimit = usage?.onDemandLimitUsd ?? null;
  const used = usage?.onDemandUsedUsd ?? 0;
  const remaining = usage?.onDemandRemainingUsd;
  const unlimited = currentLimit == null;
  const percent = onDemandPercent(used, currentLimit);

  const [customValue, setCustomValue] = useState("");
  useEffect(() => {
    if (currentLimit != null) {
      setCustomValue(String(Math.round(currentLimit)));
    }
  }, [currentLimit]);

  const applyLimit = useCallback(
    async (limitUsd: number | null) => {
      await onSetLimit(limitUsd);
    },
    [onSetLimit],
  );

  const applyCustom = useCallback(async () => {
    const parsed = Number.parseFloat(customValue.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 1) return;
    await applyLimit(Math.round(parsed * 100) / 100);
  }, [applyLimit, customValue]);

  return (
    <div className="settings-on-demand-limit mt-3 border-t border-white/10 pt-3">
      <p className="settings-section__label mb-1">Plafond à la demande</p>
      <p className="settings-section__hint mb-3">
        Consommation facturée au-delà de votre forfait Pro (même calcul input/output par modèle,
        marge ×{(usage?.onDemandMarkupMultiplier ?? 1.65).toFixed(2)} au lieu de ×
        {(usage?.markupMultiplier ?? 1.25).toFixed(2)}).
      </p>

      {loading && !usage && (
        <p className="settings-section__hint">Chargement…</p>
      )}

      {usage && (
        <>
          {!unlimited && (
            <div
              className="settings-usage-percent settings-usage-percent--compact mb-3"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <span className="settings-usage-percent__value text-2xl">{percent}%</span>
              <span className="settings-usage-percent__label">
                du plafond à la demande ({formatUsd(used)} / {formatUsd(currentLimit!)})
              </span>
            </div>
          )}
          {unlimited && (
            <p className="settings-section__hint mb-3">
              Illimité — {formatUsd(used)} consommé au-delà du forfait ce mois-ci.
            </p>
          )}
          {!unlimited && remaining != null && remaining <= 0 && (
            <p className="settings-section__hint text-amber-300 mb-3">
              Plafond atteint — augmentez la limite pour continuer.
            </p>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((amount) => (
          <button
            key={amount}
            type="button"
            disabled={saving}
            className={clsx(
              "rounded-lg border px-3 py-1.5 text-sm transition-colors",
              currentLimit === amount
                ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200"
                : "border-white/10 bg-white/5 text-muted-200 hover:border-white/20 hover:bg-white/10",
            )}
            onClick={() => void applyLimit(amount)}
          >
            {formatUsd(amount)}
          </button>
        ))}
        <button
          type="button"
          disabled={saving}
          className={clsx(
            "rounded-lg border px-3 py-1.5 text-sm transition-colors",
            unlimited
              ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200"
              : "border-white/10 bg-white/5 text-muted-200 hover:border-white/20 hover:bg-white/10",
          )}
          onClick={() => void applyLimit(null)}
        >
          Illimité
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="on-demand-custom-limit">
          Plafond personnalisé en USD
        </label>
        <input
          id="on-demand-custom-limit"
          type="number"
          min={1}
          step={1}
          placeholder="Montant custom"
          value={customValue}
          disabled={saving}
          onChange={(e) => setCustomValue(e.target.value)}
          className="w-32 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-muted-500"
        />
        <button
          type="button"
          disabled={saving || !customValue.trim()}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-muted-200 hover:border-white/20 hover:bg-white/10 disabled:opacity-40"
          onClick={() => void applyCustom()}
        >
          Appliquer
        </button>
      </div>

      {error && <p className="settings-section__hint text-red-400 mt-2">{error}</p>}
    </div>
  );
}
