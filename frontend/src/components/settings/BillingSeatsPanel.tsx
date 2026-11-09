import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { billingApi, type OwnedSeats } from "../../lib/billingApi";
import { useAuthStore } from "../../store/useAuthStore";

function formatSeatValue(cents: number, currency: string): string {
  const amount = Math.max(0, cents) / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "usd",
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
  }
}

export default function BillingSeatsPanel() {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [inventory, setInventory] = useState<OwnedSeats | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setInventory(null);
      return;
    }
    let cancelled = false;
    void billingApi
      .ownedSeats()
      .then((next) => {
        if (!cancelled) setInventory(next);
      })
      .catch(() => {
        if (!cancelled) setInventory(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  if (!inventory || inventory.total < 1) return null;

  const value = formatSeatValue(inventory.valueAmountCents, inventory.currency);
  const showGroupNames = inventory.groups.length > 1;

  const removeSeat = async (seatId: string, source: string, workspaceId?: string | null) => {
    setBusyId(seatId);
    setError(null);
    try {
      const next = await billingApi.releaseSeat({ source, workspaceId });
      setInventory(next);
      setConfirmId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("billingSeats.error"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="settings-section settings-section--card billing-seats">
      <div
        className="billing-seats__bar"
        aria-label={t("billingSeats.summary", {
          given: inventory.given,
          total: inventory.total,
          value,
        })}
      >
        <div className="billing-seats__stat">
          <span className="billing-seats__value">{inventory.given}</span>
          <span className="billing-seats__label">{t("billingSeats.given")}</span>
        </div>
        <span className="billing-seats__divider" aria-hidden />
        <div className="billing-seats__stat">
          <span className="billing-seats__value">{inventory.total}</span>
          <span className="billing-seats__label">{t("billingSeats.total")}</span>
        </div>
        <span className="billing-seats__divider" aria-hidden />
        <div className="billing-seats__stat">
          <span className="billing-seats__value">{value}</span>
          <span className="billing-seats__label">{t("billingSeats.perMonth")}</span>
        </div>
      </div>
      <div className="billing-seats__groups">
        {inventory.groups.map((group) => (
          <div key={group.id} className="billing-seats__group">
            {showGroupNames && group.workspaceName ? (
              <p className="billing-seats__group-name">{group.workspaceName}</p>
            ) : null}
            <ul className="billing-seats__list">
              {group.seats.map((seat) => {
                const busy = busyId === seat.id;
                const confirming = confirmId === seat.id;
                return (
                  <li key={seat.id} className="billing-seats__row">
                    <span className="billing-seats__seat">
                      <span className="billing-seats__seat-name">
                        {seat.assigned ? seat.label : t("billingSeats.open")}
                      </span>
                      <span className="billing-seats__seat-meta">
                        {seat.assigned ? t("billingSeats.assigned") : null}
                      </span>
                    </span>
                    {seat.removable ? (
                      <button
                        type="button"
                        className="billing-seats__remove"
                        disabled={busy}
                        onClick={() => {
                          if (!confirming) {
                            setConfirmId(seat.id);
                            setError(null);
                            return;
                          }
                          void removeSeat(seat.id, group.source, group.workspaceId);
                        }}
                      >
                        {busy
                          ? t("billingSeats.removing")
                          : confirming
                            ? t("billingSeats.confirm")
                            : t("billingSeats.remove")}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {error ? <p className="settings-section__hint text-red-400">{error}</p> : null}
    </section>
  );
}
