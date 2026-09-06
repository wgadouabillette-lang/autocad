import clsx from "clsx";
import { useEffect, useState } from "react";
import { resolvePlanBadgeLabel } from "../../lib/subscriptionPlans";
import { useStore } from "../../store/useStore";

const SHIMMER_STORAGE_KEY = "forma-plan-badge-shimmer-at";
const SHIMMER_INTERVAL_MS = 60 * 60 * 1000;
const SHIMMER_ANIMATION_MS = 2200;

function msUntilNextShimmer(): number {
  try {
    const raw = localStorage.getItem(SHIMMER_STORAGE_KEY);
    const last = raw ? Number.parseInt(raw, 10) : 0;
    if (!Number.isFinite(last) || last <= 0) return 0;
    return Math.max(0, SHIMMER_INTERVAL_MS - (Date.now() - last));
  } catch {
    return 0;
  }
}

function markStrokeShimmerPlayed(): void {
  try {
    localStorage.setItem(SHIMMER_STORAGE_KEY, String(Date.now()));
  } catch {
    // ignore quota / private mode
  }
}

/** Capsule plan avant Support — stroke seule, shimmer 1×/heure. */
export default function PlanBadge() {
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const subscriptionTier = useStore((s) => s.subscriptionTier);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const [shimmer, setShimmer] = useState(false);

  const { label } = resolvePlanBadgeLabel({
    subscriptionPlan,
    billingManaged,
    subscriptionTier,
    workspaceEnterpriseActive,
  });

  useEffect(() => {
    let cancelled = false;
    let endTimer = 0;
    let scheduleTimer = 0;

    const play = () => {
      if (cancelled) return;
      setShimmer(true);
      markStrokeShimmerPlayed();
      endTimer = window.setTimeout(() => {
        if (!cancelled) setShimmer(false);
      }, SHIMMER_ANIMATION_MS);
      scheduleTimer = window.setTimeout(play, SHIMMER_INTERVAL_MS);
    };

    const delay = msUntilNextShimmer();
    scheduleTimer = window.setTimeout(play, delay === 0 ? 400 : delay);

    return () => {
      cancelled = true;
      window.clearTimeout(endTimer);
      window.clearTimeout(scheduleTimer);
    };
  }, []);

  return (
    <span
      className={clsx("plan-badge", shimmer && "plan-badge--shimmer")}
      aria-label={`Plan ${label}`}
      title={label}
    >
      <span className="plan-badge__label">{label}</span>
    </span>
  );
}
