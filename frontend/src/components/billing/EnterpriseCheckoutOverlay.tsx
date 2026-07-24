import { Elements } from "@stripe/react-stripe-js";
import { type StripeElementsOptions } from "@stripe/stripe-js";
import { Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocalizedUsdPrice } from "../../hooks/useLocalizedUsdPrice";
import {
  billingApi,
  type EnterpriseWorkspaceOption,
} from "../../lib/billingApi";
import { getStripePromise } from "../../lib/stripeClient";
import { useEnterpriseCheckoutStore } from "../../store/useEnterpriseCheckoutStore";
import { useStore } from "../../store/useStore";
import {
  CHECKOUT_ELEMENTS_APPEARANCE,
  CheckoutOverlaySkeleton,
  CheckoutPaymentForm,
} from "./CheckoutPaymentForm";

type Step = "configure" | "pay";

function formatUsdFromCents(cents: number): string {
  const dollars = cents / 100;
  if (Number.isInteger(dollars)) return `$${dollars}`;
  return `$${dollars.toFixed(2)}`;
}

function minSeatsForWorkspace(
  workspace: EnterpriseWorkspaceOption | null,
  globalMin: number,
): number {
  if (!workspace) return Math.max(globalMin, 1);
  return Math.max(globalMin, workspace.memberCount, 1);
}

export default function EnterpriseCheckoutOverlay() {
  const open = useEnterpriseCheckoutStore((s) => s.open);
  const preferredWorkspaceId = useEnterpriseCheckoutStore((s) => s.preferredWorkspaceId);
  const closeCheckout = useEnterpriseCheckoutStore((s) => s.closeCheckout);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const activeRoomId = useStore((s) => s.activeRoomId);

  const [step, setStep] = useState<Step>("configure");
  const [workspaces, setWorkspaces] = useState<EnterpriseWorkspaceOption[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [workspaceId, setWorkspaceId] = useState("");
  const [seatCount, setSeatCount] = useState(1);
  const [unitCents, setUnitCents] = useState(1800);
  const [minMembers, setMinMembers] = useState(1);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [paidSeatCount, setPaidSeatCount] = useState(0);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [intentError, setIntentError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [awaitingWebhook, setAwaitingWebhook] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [elementsReady, setElementsReady] = useState(false);

  const availableWorkspaces = useMemo(
    () =>
      workspaces.filter(
        (workspace) => !workspace.enterpriseActive && workspace.isOwner !== false,
      ),
    [workspaces],
  );

  const selectedWorkspace =
    availableWorkspaces.find((workspace) => workspace.workspaceId === workspaceId) ?? null;

  const minSeats = minSeatsForWorkspace(selectedWorkspace, minMembers);
  const totalCents = unitCents * seatCount;
  const { localized: localizedUnit } = useLocalizedUsdPrice(open ? unitCents : null, "seat-month");
  const { localized: localizedTotal } = useLocalizedUsdPrice(open ? totalCents : null, "month");
  const unitLabel = localizedUnit?.amountLabel ?? formatUsdFromCents(unitCents);
  const unitFrequency = localizedUnit?.frequencyLabel ?? "/ seat";
  const totalLabel = localizedTotal?.amountLabel ?? formatUsdFromCents(totalCents);
  const totalFrequency = localizedTotal?.frequencyLabel ?? "/ month";
  const usdUnitHint = localizedUnit?.converted
    ? `${localizedUnit.usdLabel} US / siège`
    : null;

  const reset = useCallback(() => {
    setStep("configure");
    setWorkspaces([]);
    setLoadingWorkspaces(false);
    setWorkspaceId("");
    setSeatCount(1);
    setClientSecret(null);
    setPublishableKey(null);
    setIntentError(null);
    setConfigError(null);
    setLoadingIntent(false);
    setAwaitingWebhook(false);
    setActivationError(null);
    setElementsReady(false);
    setWorkspaceName("");
    setPaidSeatCount(0);
  }, []);

  const onElementsReady = useCallback(() => {
    setElementsReady(true);
  }, []);

  const finishOpen = useCallback(() => {
    closeCheckout();
    reset();
  }, [closeCheckout, reset]);

  const close = useCallback(() => {
    if (awaitingWebhook && !activationError) return;
    finishOpen();
  }, [awaitingWebhook, activationError, finishOpen]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !awaitingWebhook) close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close, awaitingWebhook]);

  // Charge config + workspaces à l'ouverture (étape configure).
  useEffect(() => {
    if (!open) {
      reset();
      return;
    }

    let cancelled = false;
    setStep("configure");
    setLoadingWorkspaces(true);
    setConfigError(null);
    setIntentError(null);
    setAwaitingWebhook(false);
    setClientSecret(null);
    setElementsReady(false);

    void (async () => {
      try {
        const [config, { workspaces: list }] = await Promise.all([
          billingApi.config(),
          billingApi.enterpriseWorkspaces(),
        ]);
        if (cancelled) return;
        setUnitCents(config.enterpriseSeatUnitAmountCents ?? 1800);
        setMinMembers(config.enterpriseMinMembers ?? 1);
        const selectable = list.filter(
          (workspace) => !workspace.enterpriseActive && workspace.isOwner !== false,
        );
        setWorkspaces(list);

        const preferred =
          selectable.find((workspace) => workspace.workspaceId === preferredWorkspaceId) ??
          selectable.find(
            (workspace) => workspace.workspaceId === activeRoomId.trim().toLowerCase(),
          ) ??
          selectable[0] ??
          null;

        if (!preferred) {
          setConfigError(
            list.length === 0
              ? "Aucun workspace dont vous êtes propriétaire. Créez-en un pour souscrire à Entreprise."
              : "Tous vos workspaces ont déjà un abonnement Entreprise. Gérez-les via le portail Stripe.",
          );
          setWorkspaceId("");
          setLoadingWorkspaces(false);
          return;
        }

        setWorkspaceId(preferred.workspaceId);
        setSeatCount(minSeatsForWorkspace(preferred, config.enterpriseMinMembers ?? 1));
        setLoadingWorkspaces(false);
      } catch (err) {
        if (cancelled) return;
        setConfigError(
          err instanceof Error ? err.message : "Impossible de charger les workspaces.",
        );
        setLoadingWorkspaces(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, preferredWorkspaceId, activeRoomId, reset]);

  // Ajuste le plancher de sièges quand le workspace change.
  useEffect(() => {
    if (step !== "configure" || !selectedWorkspace) return;
    setSeatCount((current) => Math.max(current, minSeats));
  }, [selectedWorkspace, minSeats, step]);

  useEffect(() => {
    if (!open || !awaitingWebhook || !workspaceId) return;
    const activeId = activeRoomId.trim().toLowerCase();
    if (workspaceEnterpriseActive && activeId === workspaceId) {
      finishOpen();
    }
  }, [open, awaitingWebhook, workspaceEnterpriseActive, activeRoomId, workspaceId, finishOpen]);

  useEffect(() => {
    if (!open || !awaitingWebhook || !workspaceId || activationError) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 12;

    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const status = await billingApi.syncEnterprise(workspaceId);
        if (cancelled) return;
        if (status.subscriptionPlan === "enterprise" && status.billingManaged) {
          const activeId = useStore.getState().activeRoomId.trim().toLowerCase();
          if (activeId === workspaceId) {
            useStore.setState({ workspaceEnterpriseActive: true });
          }
          finishOpen();
          return;
        }
      } catch {
        /* retry */
      }
      if (cancelled) return;
      if (attempts >= maxAttempts) {
        setActivationError(
          "Paiement reçu, mais l'activation Entreprise tarde. Vérifiez que le webhook Stripe tourne (`stripe listen`), puis rouvrez l'app.",
        );
        return;
      }
      window.setTimeout(() => {
        void tick();
      }, 1500);
    };

    const initial = window.setTimeout(() => {
      void tick();
    }, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(initial);
    };
  }, [open, awaitingWebhook, activationError, workspaceId, finishOpen]);

  const startPayment = async () => {
    if (!workspaceId || !selectedWorkspace) {
      setConfigError("Choisissez un workspace à booster.");
      return;
    }
    setConfigError(null);
    setIntentError(null);
    setLoadingIntent(true);
    setElementsReady(false);
    setStep("pay");
    setClientSecret(null);

    try {
      const intent = await billingApi.checkoutEnterpriseIntent(workspaceId, seatCount);
      setClientSecret(intent.clientSecret);
      setPublishableKey(intent.publishableKey);
      setWorkspaceName(intent.workspaceName || selectedWorkspace.name);
      setPaidSeatCount(intent.seatCount);
      setUnitCents(intent.unitAmountCents || unitCents);
      setLoadingIntent(false);
    } catch (err) {
      setIntentError(err instanceof Error ? err.message : "Impossible de démarrer le paiement.");
      setLoadingIntent(false);
    }
  };

  const backToConfigure = () => {
    if (awaitingWebhook) return;
    setStep("configure");
    setClientSecret(null);
    setPublishableKey(null);
    setIntentError(null);
    setLoadingIntent(false);
    setElementsReady(false);
  };

  const stripePromise = useMemo(
    () => (publishableKey ? getStripePromise(publishableKey) : null),
    [publishableKey],
  );

  const elementsOptions = useMemo<StripeElementsOptions | null>(() => {
    if (!clientSecret) return null;
    return {
      clientSecret,
      appearance: CHECKOUT_ELEMENTS_APPEARANCE,
    };
  }, [clientSecret]);

  const onPaid = useCallback(() => {
    setActivationError(null);
    setAwaitingWebhook(true);
  }, []);

  if (!open) return null;

  const payTotalLabel = localizedTotal?.amountLabel ?? formatUsdFromCents(unitCents * (paidSeatCount || seatCount));
  const payTotalFrequency = localizedTotal?.frequencyLabel ?? "/ month";
  const showPayShimmer =
    step === "pay" && !awaitingWebhook && !intentError && (loadingIntent || !elementsReady);

  return createPortal(
    <div
      className="workspace-modal pro-checkout-overlay enterprise-checkout-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Passer à Entreprise"
    >
      <button
        type="button"
        className="workspace-modal__backdrop"
        aria-label={awaitingWebhook ? "Activation en cours" : "Fermer"}
        onClick={awaitingWebhook ? undefined : close}
      />
      <div className="workspace-modal__card pro-checkout-overlay__card enterprise-checkout-overlay__card">
        <div className="pro-checkout-overlay__content">
          {!awaitingWebhook ? (
            <button
              type="button"
              className="workspace-modal__close"
              onClick={close}
              aria-label="Fermer"
            >
              <X size={18} aria-hidden />
            </button>
          ) : null}

          {awaitingWebhook ? (
            <div className="workspace-modal__scroll workspace-modal__scroll--form pro-checkout-overlay__body">
              <p className="workspace-modal__empty">
                {activationError
                  ? activationError
                  : `Paiement reçu — activation Entreprise pour « ${workspaceName} »…`}
              </p>
              {activationError ? (
                <button
                  type="button"
                  className="workspace-modal__cta workspace-modal__cta--secondary"
                  onClick={finishOpen}
                >
                  Fermer
                </button>
              ) : null}
            </div>
          ) : step === "configure" ? (
            <>
              <header className="workspace-modal__header pro-checkout-overlay__header enterprise-checkout-overlay__header">
                <h2 className="workspace-modal__title">Booster un workspace</h2>
                <p className="pro-checkout-overlay__price">
                  <span className="pro-checkout-overlay__price-amount">{unitLabel}</span>
                  <span className="pro-checkout-overlay__price-frequency">{unitFrequency}</span>
                </p>
                {usdUnitHint ? (
                  <p className="pro-checkout-overlay__workspace-hint">
                    Tarif de base {usdUnitHint} — affiché dans votre devise
                  </p>
                ) : null}
              </header>
              <div className="workspace-modal__scroll workspace-modal__scroll--form pro-checkout-overlay__body enterprise-checkout-overlay__configure">
                {loadingWorkspaces ? (
                  <p className="settings-section__hint">Chargement des workspaces…</p>
                ) : (
                  <>
                    <label className="enterprise-checkout-overlay__field">
                      <span className="enterprise-checkout-overlay__label">Workspace</span>
                      <select
                        className="input w-full enterprise-checkout-overlay__select"
                        value={workspaceId}
                        disabled={availableWorkspaces.length === 0}
                        onChange={(event) => {
                          const nextId = event.target.value;
                          setWorkspaceId(nextId);
                          const next =
                            availableWorkspaces.find((item) => item.workspaceId === nextId) ??
                            null;
                          setSeatCount(minSeatsForWorkspace(next, minMembers));
                        }}
                      >
                        {availableWorkspaces.length === 0 ? (
                          <option value="">Aucun workspace disponible</option>
                        ) : (
                          availableWorkspaces.map((workspace) => (
                            <option key={workspace.workspaceId} value={workspace.workspaceId}>
                              {workspace.name} · {workspace.memberCount} membre
                              {workspace.memberCount > 1 ? "s" : ""}
                            </option>
                          ))
                        )}
                      </select>
                    </label>

                    <div className="enterprise-checkout-overlay__field">
                      <span className="enterprise-checkout-overlay__label">Nombre de sièges</span>
                      <div className="enterprise-checkout-overlay__seats">
                        <button
                          type="button"
                          className="enterprise-checkout-overlay__seat-btn"
                          aria-label="Retirer un siège"
                          disabled={seatCount <= minSeats}
                          onClick={() => setSeatCount((value) => Math.max(minSeats, value - 1))}
                        >
                          <Minus size={16} aria-hidden />
                        </button>
                        <input
                          type="number"
                          className="input enterprise-checkout-overlay__seat-input"
                          min={minSeats}
                          max={500}
                          value={seatCount}
                          onChange={(event) => {
                            const raw = Number(event.target.value);
                            if (!Number.isFinite(raw)) return;
                            setSeatCount(Math.min(500, Math.max(minSeats, Math.round(raw))));
                          }}
                        />
                        <button
                          type="button"
                          className="enterprise-checkout-overlay__seat-btn"
                          aria-label="Ajouter un siège"
                          disabled={seatCount >= 500}
                          onClick={() => setSeatCount((value) => Math.min(500, value + 1))}
                        >
                          <Plus size={16} aria-hidden />
                        </button>
                      </div>
                      {selectedWorkspace ? (
                        <p className="enterprise-checkout-overlay__hint">
                          Minimum {minSeats} pour couvrir {selectedWorkspace.memberCount} membre
                          {selectedWorkspace.memberCount > 1 ? "s" : ""}.
                        </p>
                      ) : null}
                    </div>

                    <div className="enterprise-checkout-overlay__summary">
                      <div className="enterprise-checkout-overlay__summary-row">
                        <span>Prix unitaire</span>
                        <span>
                          {unitLabel}{" "}
                          <span className="text-muted-500">{unitFrequency.replace(/^\//, "").trim()}</span>
                        </span>
                      </div>
                      <div className="enterprise-checkout-overlay__summary-row">
                        <span>Sièges</span>
                        <span>× {seatCount}</span>
                      </div>
                      <div className="enterprise-checkout-overlay__summary-row enterprise-checkout-overlay__summary-row--total">
                        <span>Total</span>
                        <span>
                          {totalLabel}{" "}
                          <span className="text-muted-500">{totalFrequency.replace(/^\//, "").trim()}</span>
                        </span>
                      </div>
                    </div>

                    {configError ? (
                      <p className="pro-checkout-overlay__error">{configError}</p>
                    ) : null}

                    <div className="pro-checkout-overlay__actions">
                      <button
                        type="button"
                        className="workspace-modal__cta workspace-modal__cta--primary pro-checkout-overlay__submit"
                        disabled={!workspaceId || availableWorkspaces.length === 0 || loadingWorkspaces}
                        onClick={() => void startPayment()}
                      >
                        Continuer vers le paiement
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : intentError ? (
            <div className="workspace-modal__scroll workspace-modal__scroll--form pro-checkout-overlay__body">
              <p className="pro-checkout-overlay__error">{intentError}</p>
              <div className="enterprise-checkout-overlay__error-actions">
                <button
                  type="button"
                  className="workspace-modal__cta workspace-modal__cta--secondary"
                  onClick={backToConfigure}
                >
                  Retour
                </button>
                <button
                  type="button"
                  className="workspace-modal__cta workspace-modal__cta--primary"
                  onClick={() => void startPayment()}
                >
                  Réessayer
                </button>
              </div>
            </div>
          ) : (
            <div className="pro-checkout-overlay__load-shell" aria-busy={showPayShimmer}>
              {showPayShimmer ? <CheckoutOverlaySkeleton /> : null}
              <div
                className={
                  showPayShimmer
                    ? "pro-checkout-overlay__live pro-checkout-overlay__live--loading"
                    : "pro-checkout-overlay__live"
                }
              >
                <header className="workspace-modal__header pro-checkout-overlay__header">
                  <button
                    type="button"
                    className="enterprise-checkout-overlay__back"
                    onClick={backToConfigure}
                  >
                    ← Modifier sièges / workspace
                  </button>
                  <h2 className="workspace-modal__title">Passer à Entreprise</h2>
                  <p className="pro-checkout-overlay__price">
                    <span className="pro-checkout-overlay__price-amount">{payTotalLabel}</span>
                    {payTotalFrequency ? (
                      <span className="pro-checkout-overlay__price-frequency">{payTotalFrequency}</span>
                    ) : null}
                  </p>
                  <p className="pro-checkout-overlay__workspace-hint">
                    Workspace « {workspaceName} » · {paidSeatCount || seatCount} siège
                    {(paidSeatCount || seatCount) > 1 ? "s" : ""} × {unitLabel}
                    {localizedTotal?.converted ? ` · base ${localizedTotal.usdLabel} US` : ""}
                  </p>
                </header>
                <div className="workspace-modal__scroll workspace-modal__scroll--form pro-checkout-overlay__body">
                  {stripePromise && elementsOptions ? (
                    <Elements stripe={stripePromise} options={elementsOptions}>
                      <CheckoutPaymentForm
                        clientSecret={clientSecret!}
                        onPaid={onPaid}
                        busy={awaitingWebhook}
                        onElementsReady={onElementsReady}
                      />
                    </Elements>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
