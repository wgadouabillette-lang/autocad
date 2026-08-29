import clsx from "clsx";
import { Check } from "lucide-react";

export interface SettingsPlanCardProps {
  eyebrow?: string;
  label: string;
  price: string;
  description?: string;
  features: string[];
  active?: boolean;
  ctaLabel: string;
  ctaDisabled?: boolean;
  onCtaClick?: () => void;
  onPrefetch?: () => void;
  ariaLabel?: string;
}

export default function SettingsPlanCard({
  eyebrow,
  label,
  price,
  description,
  features,
  active = false,
  ctaLabel,
  ctaDisabled = false,
  onCtaClick,
  onPrefetch,
  ariaLabel,
}: SettingsPlanCardProps) {
  return (
    <article
      className={clsx("settings-plan-card", active && "settings-plan-card--active")}
      aria-label={ariaLabel ?? label}
    >
      <div className="settings-plan-card__top">
        {eyebrow ? <p className="settings-plan-card__eyebrow">{eyebrow}</p> : null}
        <div className="settings-plan-card__header">
          <h3 className="settings-plan-card__name">{label}</h3>
          {active ? (
            <Check size={14} strokeWidth={2.5} className="settings-plan-card__check" aria-hidden />
          ) : null}
        </div>
        <p className="settings-plan-card__price">{price}</p>
        {description ? <p className="settings-plan-card__desc">{description}</p> : null}
      </div>
      <div className="settings-plan-card__divider" role="presentation" />
      <ul className="settings-plan-card__features">
        {features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <button
        type="button"
        className="settings-plan-card__cta"
        disabled={ctaDisabled}
        onClick={onCtaClick}
        onPointerEnter={onPrefetch}
      >
        {ctaLabel}
      </button>
    </article>
  );
}
