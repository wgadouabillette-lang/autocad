import { Elements } from "@stripe/react-stripe-js";
import { type StripeElementsOptions } from "@stripe/stripe-js";
import { ChevronLeft, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { billingApi, type SeatCheckoutIntent } from "../../lib/billingApi";
import { ensureSharedWorkspacePublished } from "../../lib/firebase/workspaceRegistry";
import { isMarketingPreview } from "../../lib/marketingPreview";
import { getStripePromise } from "../../lib/stripeClient";
import { intlLocaleForAppLocale, isAppLocale } from "../../lib/appLocale";
import i18n from "../../lib/i18n";
import { SEAT_PRICE_USD } from "../../lib/subscriptionPlanConstants";
import { useAuthStore } from "../../store/useAuthStore";
import { useStore } from "../../store/useStore";
import { useWorkspaceUpgradeStore } from "../../store/useWorkspaceUpgradeStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";
import { CHECKOUT_ELEMENTS_APPEARANCE, CheckoutPaymentForm } from "./CheckoutPaymentForm";

type UpgradeStep = "seats" | "pay" | "waiting";

const SEAT_MIN = 1;
const SEAT_MAX = 50;

function clampSeats(value: number): number {
  return Math.min(SEAT_MAX, Math.max(SEAT_MIN, Math.round(value) || SEAT_MIN));
}

function formatSeatAmount(amount: number): string {
  const primary = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const locale = intlLocaleForAppLocale(isAppLocale(primary) ? primary : "en");
  return amount.toLocaleString(locale);
}

export default function WorkspaceUpgradeOverlay() {
  const { t } = useTranslation();
  const open = useWorkspaceUpgradeStore((s) => s.open);
  const closeUpgrade = useWorkspaceUpgradeStore((s) => s.closeUpgrade);
  const [step, setStep] = useState<UpgradeStep>("seats");
  const [seats, setSeats] = useState(1);
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [intent, setIntent] = useState<SeatCheckoutIntent | null>(null);
  const [expectedSeats, setExpectedSeats] = useState(0);
  const [accessGranted, setAccessGranted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = seats * SEAT_PRICE_USD;

  useEffect(() => {
    closeUpgrade();
  }, [closeUpgrade]);

  useEffect(() => {
    if (!open) return;
    const id = useStore.getState().activeRoomId;
    const workspace = useWorkspacesStore.getState().findWorkspace(id);
    setWorkspaceId(workspace?.id || id);
    setWorkspaceName(workspace?.name || "");
    setStep("seats");
    setSeats(1);
    setIntent(null);
    setExpectedSeats(0);
    setAccessGranted(false);
    setBusy(false);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && step !== "waiting") closeUpgrade();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeUpgrade, open, step]);

  useEffect(() => {
    if (!open || step !== "waiting" || !workspaceId) return;
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const status = await billingApi.syncEnterprise(workspaceId);
        if (cancelled) return;
        const ready =
          status.billingManaged &&
          (expectedSeats <= 0 || status.seatCount >= expectedSeats);
        if (ready) {
          setAccessGranted(true);
          if (useStore.getState().activeRoomId === workspaceId) {
            useStore.setState({ workspaceEnterpriseActive: true });
          }
          window.setTimeout(() => {
            if (!cancelled) closeUpgrade();
          }, 900);
          return;
        }
      } catch {
        // Le prochain essai reprend.
      }
      if (attempts < 12) window.setTimeout(() => void tick(), 800);
      else if (!cancelled) {
        setError(t("onboarding.errors.activation"));
        setStep("seats");
      }
    };
    const initial = window.setTimeout(() => void tick(), 400);
    return () => {
      cancelled = true;
      window.clearTimeout(initial);
    };
  }, [closeUpgrade, expectedSeats, open, step, t, workspaceId]);

  const continueToPay = async () => {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      const uid = useAuthStore.getState().firebaseUid;
      const workspace = useWorkspacesStore.getState().findWorkspace(workspaceId);
      if (workspace && uid && workspace.ownerId === uid) {
        await ensureSharedWorkspacePublished(workspace, uid);
      }
      const next = await billingApi.checkoutSeats({
        mode: "enterprise",
        seatCount: seats,
        workspaceId,
      });
      setIntent(next);
      setExpectedSeats(next.seatCount);
      if (next.paid || !next.clientSecret) {
        setAccessGranted(false);
        setStep("waiting");
        return;
      }
      setStep("pay");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("onboarding.errors.startPay"));
    } finally {
      setBusy(false);
    }
  };

  const stripePromise = useMemo(
    () => (intent?.publishableKey ? getStripePromise(intent.publishableKey) : null),
    [intent?.publishableKey],
  );
  const elementsOptions = useMemo<StripeElementsOptions | null>(() => {
    if (!intent?.clientSecret) return null;
    return {
      clientSecret: intent.clientSecret,
      appearance: {
        ...CHECKOUT_ELEMENTS_APPEARANCE,
        rules: {
          ...CHECKOUT_ELEMENTS_APPEARANCE?.rules,
          ".TermsText": {
            fontSize: "0px",
            lineHeight: "0px",
            paddingTop: "0px",
            paddingBottom: "0px",
          },
        },
      },
    };
  }, [intent?.clientSecret]);

  if (!open || isMarketingPreview()) return null;

  const payAmount =
    intent && intent.totalAmountCents > 0 ? Math.round(intent.totalAmountCents / 100) : total;
  const payTotal = t("onboarding.seats.amount", { amount: formatSeatAmount(payAmount) });
  const showAccess = step === "waiting";

  return createPortal(
    <div className="seat-gate" role="dialog" aria-modal="true" aria-labelledby="workspace-upgrade-title">
      <div
        className="seat-gate__backdrop"
        onClick={() => {
          if (step !== "waiting") closeUpgrade();
        }}
      />
      <div
        className={
          showAccess
            ? "seat-gate__card seat-gate__card--choose seat-gate__card--welcome"
            : "seat-gate__card seat-gate__card--plain seat-gate__card--questions"
        }
      >
        {showAccess ? (
          <div className="seat-gate__body seat-gate__body--flow">
            <div className="seat-gate__survey seat-gate__survey--welcome">
              <div className="seat-gate__pay-head seat-gate__pay-head--stack">
                {accessGranted ? null : (
                  <div className="app-loading-screen__spinner seat-gate__access-spinner" role="status" />
                )}
                <h2 id="workspace-upgrade-title" className="seat-gate__title seat-gate__title--wrap">
                  {accessGranted ? t("onboarding.waiting.authorized") : t("onboarding.waiting.title")}
                </h2>
                {error ? <p className="seat-gate__error">{error}</p> : null}
              </div>
            </div>
          </div>
        ) : step === "pay" && intent?.clientSecret && stripePromise && elementsOptions ? (
          <div className="seat-gate__body seat-gate__body--flow">
            <button type="button" className="seat-gate__back" onClick={() => setStep("seats")}>
              <ChevronLeft size={16} aria-hidden />
              {t("common.back")}
            </button>
            <div className="seat-gate__pay-head">
              <h2 id="workspace-upgrade-title" className="seat-gate__title">
                {t("onboarding.pay.title")}
              </h2>
              <p className="seat-gate__price">
                <span>{payTotal}</span>
                <span className="seat-gate__price-note">{t("onboarding.pay.perMonth")}</span>
              </p>
            </div>
            <Elements key={intent.clientSecret} stripe={stripePromise} options={elementsOptions}>
              <CheckoutPaymentForm
                clientSecret={intent.clientSecret}
                busy={busy}
                onElementsReady={() => undefined}
                onPaid={() => {
                  setAccessGranted(false);
                  setError(null);
                  setStep("waiting");
                }}
                submitLabel={t("onboarding.pay.pay")}
                payingLabel={t("onboarding.pay.paying")}
                pinSubmit
                afterFields={
                  <p className="seat-gate__mandate">
                    {t("onboarding.pay.mandate", { merchant: intent.merchantName || "Meetra" })}
                  </p>
                }
              />
            </Elements>
            {error ? <p className="seat-gate__error">{error}</p> : null}
          </div>
        ) : (
          <div className="seat-gate__body seat-gate__body--flow">
            <button type="button" className="seat-gate__back" onClick={() => closeUpgrade()}>
              {t("common.close")}
            </button>
            <div className="seat-gate__pay-head seat-gate__pay-head--stack">
              <h2 id="workspace-upgrade-title" className="seat-gate__title seat-gate__title--wrap">
                {t("onboarding.upgrade.title")}
              </h2>
              <p className="seat-gate__subtitle">
                {t("onboarding.upgrade.subtitle", { workspace: workspaceName || t("settings.tabs.workspaces") })}
              </p>
            </div>
            <div className="seat-gate__fields">
              <div className="seat-gate__stepper">
                <button
                  type="button"
                  className="seat-gate__step"
                  aria-label={t("onboarding.seats.removeSeat")}
                  disabled={seats <= SEAT_MIN}
                  onClick={() => setSeats((current) => clampSeats(current - 1))}
                >
                  <Minus size={16} aria-hidden />
                </button>
                <div className="seat-gate__count">
                  <span className="seat-gate__count-value">{seats}</span>
                  <span className="seat-gate__count-label">
                    {t(seats > 1 ? "onboarding.seats.seats" : "onboarding.seats.seat")}
                  </span>
                </div>
                <button
                  type="button"
                  className="seat-gate__step"
                  aria-label={t("onboarding.seats.addSeat")}
                  disabled={seats >= SEAT_MAX}
                  onClick={() => setSeats((current) => clampSeats(current + 1))}
                >
                  <Plus size={16} aria-hidden />
                </button>
              </div>
              <p className="seat-gate__price">
                <span>{t("onboarding.seats.amount", { amount: formatSeatAmount(total) })}</span>
                <span className="seat-gate__price-note">{t("onboarding.pay.perMonth")}</span>
              </p>
              {error ? <p className="seat-gate__error">{error}</p> : null}
            </div>
            <div className="seat-gate__pay-anchor">
              <button
                type="button"
                className="seat-gate__pay"
                disabled={busy || !workspaceId}
                onClick={() => void continueToPay()}
              >
                {busy ? t("onboarding.seats.preparing") : t("onboarding.upgrade.continue")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
