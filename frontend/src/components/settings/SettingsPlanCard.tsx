export interface SettingsPlanCardProps {
  label: string;
  price: string;
  features: string[];
  active?: boolean;
  ctaLabel: string;
  ctaDisabled?: boolean;
  onCtaClick?: () => void;
}

export default function SettingsPlanCard({
  label,
  price,
  features,
  active = false,
  ctaLabel,
  ctaDisabled = false,
  onCtaClick,
}: SettingsPlanCardProps) {
  return (
    <article
      className={active ? "settings-plan-card settings-plan-card--active" : "settings-plan-card"}
    >
      <h3 className="settings-plan-card__name">{label}</h3>
      <p className="settings-plan-card__price">{price}</p>
      <button
        type="button"
        className="settings-plan-card__cta"
        disabled={ctaDisabled}
        onClick={onCtaClick}
      >
        {ctaLabel}
      </button>
      <div className="settings-plan-card__divider" role="presentation" />
      <ul className="settings-plan-card__features">
        {features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
    </article>
  );
}
