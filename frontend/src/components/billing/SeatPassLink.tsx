import { useEffect, useState } from "react";
import { billingApi, type SeatPass } from "../../lib/billingApi";
import { copyTextToClipboard } from "../../lib/clipboard";
import { useStore } from "../../store/useStore";

/** Lien des sièges restants, visible tant qu'il reste des utilisations. */
export default function SeatPassLink() {
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const isPro = subscriptionPlan === "pro" && billingManaged;
  const [pass, setPass] = useState<SeatPass | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isPro) {
      setPass(null);
      return;
    }
    let cancelled = false;
    void billingApi
      .ensureSeatPass()
      .then((next) => {
        if (!cancelled) setPass(next);
      })
      .catch(() => {
        if (!cancelled) setPass(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isPro]);

  if (!pass || pass.remainingUses < 1 || !pass.url) return null;

  const label =
    pass.remainingUses > 1
      ? `${pass.remainingUses} utilisations restantes`
      : "1 utilisation restante";

  return (
    <div className="seat-pass-link">
      <p className="seat-pass-link__title">Lien d'invitation</p>
      <p className="seat-pass-link__meta">{label}</p>
      <input className="seat-pass-link__url" readOnly value={pass.url} />
      <button
        type="button"
        className="seat-pass-link__copy"
        onClick={() => {
          void copyTextToClipboard(pass.url).then((ok) => {
            if (!ok) return;
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? "Lien copié" : "Copier le lien"}
      </button>
    </div>
  );
}
