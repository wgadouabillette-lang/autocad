import { useEffect, useMemo } from "react";
import { useBoostedWorkspaces } from "../../hooks/useBoostedWorkspaces";
import { useBilling } from "../../hooks/useBilling";
import { resolveClientLocale } from "../../lib/billingCurrency";
import { planCatalogCards, planSettingsCopy } from "../../lib/subscriptionPlans";
import { useAuthStore } from "../../store/useAuthStore";
import { useStore } from "../../store/useStore";
import BoostedWorkspacesList from "./BoostedWorkspacesList";
import { resolveEnterpriseWorkspace } from "./EnterprisePlanSection";
import SettingsPlanCard from "./SettingsPlanCard";

export default function PlanSettingsSection() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const isPro = subscriptionPlan === "pro" && billingManaged;
  const locale = resolveClientLocale();
  const cards = useMemo(() => planCatalogCards(locale), [locale]);
  const copy = useMemo(() => planSettingsCopy(locale), [locale]);
  const proCard = cards.find((card) => card.id === "pro");
  const proPlusCard = cards.find((card) => card.id === "proPlus");
  const teamCard = cards.find((card) => card.id === "team");
  const {
    stripeEnabled,
    proPlusEnabled,
    proPriceLabel,
    proPlusPriceLabel,
    loading,
    error,
    externalCheckoutOpen,
    enterpriseEnabled,
    enterpriseSeatPriceLabel,
    checkoutPro,
    checkoutEnterprise,
    openEnterprisePortal,
    enterpriseWorkspaces,
    loadEnterpriseWorkspaces,
    prefetchCheckout,
    setBillingError,
    subscriptionTier,
  } = useBilling();
  const isProPlus = isPro && subscriptionTier === "proPlus";
  const isProOnly = isPro && !isProPlus;

  useEffect(() => {
    void loadEnterpriseWorkspaces();
  }, [loadEnterpriseWorkspaces]);

  const boostedWorkspaces = useBoostedWorkspaces(enterpriseWorkspaces);

  const handleSelectPro = () => {
    if (!isAuthenticated) {
      setBillingError(copy.errorSignInPro);
      return;
    }
    void checkoutPro("pro");
  };

  const handleSelectProPlus = () => {
    if (!isAuthenticated) {
      setBillingError(copy.errorSignInPro);
      return;
    }
    void checkoutPro("proPlus");
  };

  const handleTeamClick = () => {
    if (!isAuthenticated) {
      setBillingError(copy.errorSignInTeam);
      return;
    }

    void (async () => {
      const workspaces = await loadEnterpriseWorkspaces();
      const preferred =
        resolveEnterpriseWorkspace(workspaces, activeRoomId) ??
        (activeRoomId?.trim()
          ? {
              workspaceId: activeRoomId.trim().toLowerCase(),
              name: activeRoomId,
              memberCount: 0,
              minMembers: 2,
              eligible: false,
              enterpriseActive: workspaceEnterpriseActive,
              isOwner: true,
            }
          : null);

      if (preferred && (preferred.enterpriseActive || workspaceEnterpriseActive)) {
        void openEnterprisePortal(preferred.workspaceId);
        return;
      }

      await checkoutEnterprise(preferred?.workspaceId ?? activeRoomId);
    })();
  };

  const loadingCta = loading
    ? externalCheckoutOpen
      ? copy.ctaWaiting
      : copy.ctaOpening
    : null;
  const proPrice = stripeEnabled ? proPriceLabel : copy.proPriceFallback;
  const proPlusPrice = proPlusEnabled ? proPlusPriceLabel : copy.proPlusPriceFallback;
  const teamPrice = enterpriseEnabled ? enterpriseSeatPriceLabel : copy.teamPriceFallback;

  if (!proCard || !proPlusCard || !teamCard) return null;

  return (
    <>
      {!isAuthenticated && (
        <section className="settings-section">
          <p className="settings-section__hint text-amber-300">{copy.signIn}</p>
        </section>
      )}
      {isAuthenticated && !stripeEnabled && (
        <section className="settings-section">
          <p className="settings-section__hint text-amber-300">{copy.stripeMissing}</p>
        </section>
      )}
      {externalCheckoutOpen && (
        <section className="settings-section">
          <p className="settings-section__hint text-amber-300">{copy.externalCheckout}</p>
        </section>
      )}
      {error ? <p className="settings-section__hint mt-2 text-red-400">{error}</p> : null}

      <div className="settings-plan-grid">
        <SettingsPlanCard
          eyebrow={proCard.eyebrow}
          label={proCard.label}
          price={proPrice}
          description={proCard.description}
          features={proCard.features}
          active={isProOnly && !workspaceEnterpriseActive}
          ctaLabel={
            loadingCta ?? (isProOnly && !workspaceEnterpriseActive ? copy.ctaCurrent : copy.ctaPro)
          }
          ctaDisabled={loading || !isAuthenticated}
          onCtaClick={handleSelectPro}
          onPrefetch={prefetchCheckout}
          ariaLabel={copy.proAria}
        />
        <SettingsPlanCard
          eyebrow={proPlusCard.eyebrow}
          label={proPlusCard.label}
          price={proPlusPrice}
          description={proPlusCard.description}
          features={proPlusCard.features}
          active={isProPlus && !workspaceEnterpriseActive}
          ctaLabel={
            loadingCta ?? (isProPlus && !workspaceEnterpriseActive ? copy.ctaCurrent : copy.ctaProPlus)
          }
          ctaDisabled={loading || !isAuthenticated || !proPlusEnabled}
          onCtaClick={handleSelectProPlus}
          onPrefetch={prefetchCheckout}
          ariaLabel={copy.proPlusAria}
        />
        <SettingsPlanCard
          eyebrow={teamCard.eyebrow}
          label={teamCard.label}
          price={teamPrice}
          description={teamCard.description}
          features={teamCard.features}
          active={workspaceEnterpriseActive}
          ctaLabel={
            loadingCta ?? (workspaceEnterpriseActive ? copy.ctaTeamManage : copy.ctaTeam)
          }
          ctaDisabled={loading || !isAuthenticated}
          onCtaClick={handleTeamClick}
          onPrefetch={prefetchCheckout}
          ariaLabel={workspaceEnterpriseActive ? copy.teamManageAria : copy.teamAria}
        />
      </div>
      <BoostedWorkspacesList
        workspaces={boostedWorkspaces}
        onCancelled={() => {
          void loadEnterpriseWorkspaces();
        }}
      />
    </>
  );
}
