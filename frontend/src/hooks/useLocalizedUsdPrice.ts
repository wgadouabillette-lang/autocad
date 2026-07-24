import { useEffect, useState } from "react";
import { billingApi, type LocalizedMoney } from "../lib/billingApi";
import {
  resolveClientCountry,
  resolveClientCurrency,
  resolveClientLocale,
} from "../lib/billingCurrency";

export type PriceFrequency = "month" | "seat-month";

function fallbackFrequencyLabel(frequency: PriceFrequency, locale: string): string {
  const fr = locale.toLowerCase().startsWith("fr");
  if (frequency === "seat-month") {
    return fr ? "/ siège" : "/ seat";
  }
  return fr ? "/ mois" : "/ month";
}

export function useLocalizedUsdPrice(
  usdCents: number | null | undefined,
  frequency: PriceFrequency = "month",
): {
  localized: LocalizedMoney | null;
  loading: boolean;
} {
  const [localized, setLocalized] = useState<LocalizedMoney | null>(null);
  const [loading, setLoading] = useState(false);
  const cents =
    typeof usdCents === "number" && Number.isFinite(usdCents) ? Math.max(0, Math.round(usdCents)) : null;

  useEffect(() => {
    if (cents == null) {
      setLocalized(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const locale = resolveClientLocale();
    setLoading(true);
    const timer = window.setTimeout(() => {
      void billingApi
        .localizeAmount({
          usdCents: cents,
          currency: resolveClientCurrency(),
          country: resolveClientCountry(),
          locale,
          frequency,
        })
        .then((result) => {
          if (!cancelled) {
            setLocalized(result);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            const usdLabel = `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
            setLocalized({
              currency: "USD",
              amountCents: cents,
              amountLabel: usdLabel,
              usdCents: cents,
              usdLabel,
              fxRate: 1,
              converted: false,
              frequencyLabel: fallbackFrequencyLabel(frequency, locale),
            });
            setLoading(false);
          }
        });
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cents, frequency]);

  return { localized, loading };
}
