import { Elements } from "@stripe/react-stripe-js";
import { type StripeElementsOptions } from "@stripe/stripe-js";
import {
  Bot,
  Briefcase,
  Building2,
  Calendar,
  ChevronLeft,
  Ellipsis,
  LayoutGrid,
  MessageSquare,
  Minus,
  Plus,
  Sparkles,
  Video,
  User,
  UserPlus,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { billingApi, type SeatCheckoutIntent, type SeatPass, type SeatPassWorkspace } from "../../lib/billingApi";
import { sharedWorkspaceGrantsSeat } from "../../lib/firebase/workspaceRegistry";
import { copyTextToClipboard } from "../../lib/clipboard";
import { isMarketingPreview } from "../../lib/marketingPreview";
import { getStripePromise } from "../../lib/stripeClient";
import {
  ONBOARDING_QUESTIONS,
  recordOnboardingAnswers,
  type OnboardingAnswers,
  type OnboardingQuestionId,
} from "../../lib/onboardingSurvey";
import { intlLocaleForAppLocale, isAppLocale } from "../../lib/appLocale";
import i18n from "../../lib/i18n";
import { SEAT_PRICE_USD } from "../../lib/subscriptionPlanConstants";
import { trackOnboardingChoice, trackOnboardingStep } from "../../lib/onboardingAnalytics";
import { effectiveSubscriptionPlan } from "../../lib/subscriptionPlans";
import { useAuthStore } from "../../store/useAuthStore";
import { useNotificationsStore } from "../../store/useNotificationsStore";
import { useStore } from "../../store/useStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";
import {
  CHECKOUT_ELEMENTS_APPEARANCE,
  CheckoutPaymentForm,
} from "./CheckoutPaymentForm";

type GateStep = "welcome" | OnboardingQuestionId | "choose" | "pay" | "waiting" | "share";

const CHOICE_ICONS: Record<string, LucideIcon> = {
  solo: User,
  friends: Users,
  automation: Bot,
  recording: Video,
  all: LayoutGrid,
  agent: MessageSquare,
  calendar: Calendar,
  notes: Sparkles,
  colleague: UserRound,
  enterprise: Building2,
  other: Ellipsis,
};

const SURVEY_ORDER: GateStep[] = ["plan", "purpose", "source"];
const SURVEY_STEPS = ["plan", "purpose", "source"] as const;
type SurveyStep = (typeof SURVEY_STEPS)[number];

function isSurveyStep(step: GateStep): step is SurveyStep {
  return (SURVEY_STEPS as readonly string[]).includes(step);
}
type GatePath = "buy" | "join";

const PERSONAL_MIN = 1;
const SEAT_MAX = 50;

function clampSeats(value: number, min: number): number {
  return Math.min(SEAT_MAX, Math.max(min, Math.round(value) || min));
}

function formatSeatAmount(amount: number): string {
  const primary = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const locale = intlLocaleForAppLocale(isAppLocale(primary) ? primary : "en");
  return amount.toLocaleString(locale);
}

function seatCodeFromLocation(): string {
  return new URLSearchParams(window.location.search).get("seat")?.trim() ?? "";
}

function openAccessWorkspace(preferredId?: string | null): void {
  const uid = useAuthStore.getState().firebaseUid ?? undefined;
  const workspaces = useWorkspacesStore.getState();
  const joined = workspaces.joinedWorkspaces(uid);
  const preferred = preferredId?.trim();
  const match = preferred ? joined.find((workspace) => workspace.id === preferred) : undefined;
  const id =
    preferred ||
    match?.id ||
    joined[0]?.id ||
    (uid
      ? workspaces.createPersonalWorkspace(useStore.getState().userDisplayName, uid)
      : "");
  if (!id) return;
  useStore.getState().setActiveRoom(id);
  void useAuthStore.getState().syncWorkspacesToCloud();
}

function clearSeatParam(): void {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("seat")) return;
  params.delete("seat");
  const next = params.toString();
  const url = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", url);
}

async function rememberWorkspace(workspace: SeatPassWorkspace | null | undefined): Promise<void> {
  const uid = useAuthStore.getState().firebaseUid;
  if (!uid || !workspace?.id) return;
  useWorkspacesStore.getState().addRemoteWorkspace(
    {
      id: workspace.id,
      name: workspace.name,
      accent: workspace.accent,
      ownerId: workspace.ownerId,
      ownerName: workspace.ownerName,
      createdAt: workspace.createdAt,
    },
    uid,
  );
  await useAuthStore.getState().syncWorkspacesToCloud();
}

function SeatGateBrand({ markOnly = false }: { markOnly?: boolean }) {
  return (
    <div className="seat-gate__brand" aria-label="Meetra">
      <img
        src={`${import.meta.env.BASE_URL}meetra-mark.svg`}
        alt=""
        className="app-chrome-row__brand-logo"
        draggable={false}
      />
      {markOnly ? null : <span className="app-chrome-row__brand-wordmark">Meetra</span>}
    </div>
  );
}

export default function SeatGateOverlay() {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const seatCovered = useStore((s) => s.seatCovered);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const personalPaid = billingManaged && subscriptionPlan === "pro";
  const meetraIntroCompleted = useAuthStore((s) => s.meetraIntroCompleted);
  const openingStep: GateStep = meetraIntroCompleted ? "choose" : "plan";

  const [seatCoverage, setSeatCoverage] = useState<"unknown" | "yes" | "no">("unknown");
  const [grantedWorkspaceId, setGrantedWorkspaceId] = useState<string | null>(null);
  const [accessGranted, setAccessGranted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const releaseStarted = useRef(false);
  const paymentWait = useRef(false);
  const [path, setPath] = useState<GatePath>("buy");
  const [seats, setSeats] = useState(1);
  const [step, setStep] = useState<GateStep>(openingStep);
  const [view, setView] = useState<GateStep>(openingStep);
  const [answers, setAnswers] = useState<Partial<OnboardingAnswers>>({});
  const [leaving, setLeaving] = useState(false);
  const [questionLeaving, setQuestionLeaving] = useState(false);
  const [intent, setIntent] = useState<SeatCheckoutIntent | null>(null);
  const [pass, setPass] = useState<SeatPass | null>(null);
  const [joinInput, setJoinInput] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const joinStarted = useRef(false);
  // Déjà onboardé au montage : un redémarrage ne rejoue pas l'écran d'accès.
  const skipAccessCeremony = useRef(meetraIntroCompleted).current;

  const total = seats * SEAT_PRICE_USD;
  const covered = personalPaid || workspaceEnterpriseActive || seatCoverage === "yes" || seatCovered;

  useEffect(() => {
    if (!isAuthenticated || isMarketingPreview()) return;
    let cancelled = false;
    const joined = useWorkspacesStore.getState().joinedWorkspaces(firebaseUid ?? undefined);
    void Promise.all(
      joined.map(async (workspace) => ({
        id: workspace.id,
        ok: await sharedWorkspaceGrantsSeat(workspace.id).catch(() => false),
      })),
    ).then((rows) => {
      if (cancelled) return;
      const granted = rows.find((row) => row.ok);
      setGrantedWorkspaceId(granted?.id ?? null);
      setSeatCoverage(granted ? "yes" : "no");
    });
    return () => {
      cancelled = true;
    };
  }, [firebaseUid, isAuthenticated, personalPaid, workspaceEnterpriseActive]);

  const finishPersonal = useCallback((status: { subscriptionPlan: string; billingManaged: boolean }) => {
    const plan = effectiveSubscriptionPlan(
      status.subscriptionPlan === "pro" ? "pro" : "free",
      status.billingManaged,
    );
    if (plan === "pro" && status.billingManaged) {
      useStore.setState({ subscriptionPlan: "pro", billingManaged: true });
      setSeatCoverage("yes");
    }
  }, []);

  const redeemJoin = useCallback(async (raw: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await billingApi.redeemSeatPass(raw);
      await rememberWorkspace(result.workspace);
      if (result.workspace?.id) setGrantedWorkspaceId(result.workspace.id);
      useStore.setState({ seatCovered: true });
      clearSeatParam();
    } catch (err) {
      setError(err instanceof Error ? err.message : i18n.t("onboarding.errors.join"));
      setPath("join");
    } finally {
      setBusy(false);
    }
  }, []);

  const prepaidAccess =
    personalPaid || workspaceEnterpriseActive || seatCoverage === "yes" || seatCovered;
  const checkingAccess =
    (step === "choose" || step === "pay") &&
    seatCoverage === "unknown" &&
    !seatCovered &&
    !personalPaid &&
    !workspaceEnterpriseActive;

  const gateVisible =
    isAuthenticated &&
    !isMarketingPreview() &&
    !dismissed &&
    (!covered || step === "share" || step === "waiting" || checkingAccess);

  useLayoutEffect(() => {
    useNotificationsStore.getState().setOnboardingSilence(gateVisible);
    return () => useNotificationsStore.getState().setOnboardingSilence(false);
  }, [gateVisible]);

  useEffect(() => {
    if (!gateVisible || !firebaseUid) return;
    if (!meetraIntroCompleted && view === "plan") {
      trackOnboardingStep(firebaseUid, "welcome");
    }
    trackOnboardingStep(firebaseUid, view);
  }, [firebaseUid, gateVisible, meetraIntroCompleted, view]);

  useEffect(() => {
    if (!meetraIntroCompleted) return;
    setStep((current) => (isSurveyStep(current) ? "choose" : current));
  }, [meetraIntroCompleted]);

  useEffect(() => {
    if (!isAuthenticated || isMarketingPreview() || !meetraIntroCompleted) return;
    const code = seatCodeFromLocation();
    if (!code) return;
    if (covered) {
      clearSeatParam();
      return;
    }
    if (joinStarted.current) return;
    joinStarted.current = true;
    setPath("join");
    setJoinInput(code);
    void redeemJoin(code);
  }, [covered, isAuthenticated, meetraIntroCompleted, redeemJoin]);

  useEffect(() => {
    if (step === view) return;
    const swapQuestion = isSurveyStep(step) && isSurveyStep(view);
    if (swapQuestion) setQuestionLeaving(true);
    else setLeaving(true);
    const timer = window.setTimeout(() => {
      setView(step);
      setQuestionLeaving(false);
      setLeaving(false);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [step, view]);

  useEffect(() => {
    if (dismissed || releaseStarted.current || skipAccessCeremony) return;
    if (step !== "choose" && step !== "pay") return;
    if (!prepaidAccess) return;
    releaseStarted.current = true;
    setAccessGranted(false);
    setStep("waiting");
    window.setTimeout(() => setAccessGranted(true), 700);
    window.setTimeout(() => {
      openAccessWorkspace(grantedWorkspaceId);
      setDismissed(true);
    }, 1600);
  }, [dismissed, grantedWorkspaceId, prepaidAccess, skipAccessCeremony, step]);

  useEffect(() => {
    if (!isAuthenticated || covered || step !== "choose") return;
    let cancelled = false;
    void billingApi
      .sync()
      .then((status) => {
        if (!cancelled) finishPersonal(status);
      })
      .catch(() => {
        // Le prochain passage dans Activating reprendra.
      });
    return () => {
      cancelled = true;
    };
  }, [covered, finishPersonal, isAuthenticated, step]);

  useEffect(() => {
    if (step !== "waiting" || !paymentWait.current) return;
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const status = await billingApi.sync();
        if (cancelled) return;
        if (status.subscriptionPlan === "pro" && status.billingManaged) {
          setAccessGranted(true);
          await new Promise((resolve) => window.setTimeout(resolve, 900));
          if (cancelled) return;
          let workspaceId = grantedWorkspaceId;
          if (seats > 1) {
            try {
              const next = await billingApi.ensureSeatPass();
              if (cancelled) return;
              await rememberWorkspace(next.workspace);
              workspaceId = next.workspace?.id || workspaceId;
              if (next.remainingUses > 0 && next.url) {
                setPass(next);
                finishPersonal(status);
                openAccessWorkspace(workspaceId);
                setStep("share");
                return;
              }
            } catch {
              // Le paiement est confirmé : on ouvre quand même le workspace.
            }
          }
          finishPersonal(status);
          openAccessWorkspace(workspaceId);
          setDismissed(true);
          return;
        }
      } catch {
        // Le prochain essai reprend.
      }
      if (attempts < 12) window.setTimeout(() => void tick(), 800);
      else if (!cancelled) {
        paymentWait.current = false;
        setError(i18n.t("onboarding.errors.activation"));
        setStep("choose");
      }
    };
    const initial = window.setTimeout(() => void tick(), 600);
    return () => {
      cancelled = true;
      window.clearTimeout(initial);
    };
  }, [finishPersonal, grantedWorkspaceId, seats, step]);

  const continueToPay = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await billingApi.checkoutSeats({
        mode: "personal",
        seatCount: seats,
      });
      setIntent(next);
      setPromoCode("");
      setPromoMessage(null);
      setStep("pay");
    } catch (err) {
      setError(err instanceof Error ? err.message : i18n.t("onboarding.errors.startPay"));
    } finally {
      setBusy(false);
    }
  };

  const applyPromotion = async () => {
    if (!intent?.subscriptionId || !promoCode.trim()) return;
    setBusy(true);
    setError(null);
    setPromoMessage(null);
    try {
      const next = await billingApi.applySeatPromotion({
        subscriptionId: intent.subscriptionId,
        code: promoCode.trim(),
      });
      setIntent(next);
      setPromoMessage(i18n.t("onboarding.pay.applied"));
    } catch (err) {
      setError(err instanceof Error ? err.message : i18n.t("onboarding.errors.promo"));
    } finally {
      setBusy(false);
    }
  };

  const selectAnswer = (questionId: OnboardingQuestionId, choiceId: string) => {
    setAnswers((current) => ({ ...current, [questionId]: choiceId }));
  };

  const goBackSurvey = () => {
    if (questionLeaving || leaving) return;
    const index = SURVEY_ORDER.indexOf(view);
    const previous = index > 0 ? SURVEY_ORDER[index - 1] : null;
    if (previous) setStep(previous);
  };

  const continueSurvey = async () => {
    if (view !== "plan" && view !== "purpose" && view !== "source") return;
    const choiceId = answers[view];
    if (!choiceId) return;
    const uidForChoice = useAuthStore.getState().firebaseUid;
    if (uidForChoice) trackOnboardingChoice(uidForChoice, view, choiceId);
    if (view === "plan") {
      setStep("purpose");
      return;
    }
    if (view === "purpose") {
      setStep("source");
      return;
    }
    const uid = useAuthStore.getState().firebaseUid;
    setBusy(true);
    setError(null);
    try {
      if (uid) await recordOnboardingAnswers(uid, answers);
      await useAuthStore.getState().markMeetraIntroCompleted();
      setStep("choose");
    } catch (err) {
      setError(err instanceof Error ? err.message : i18n.t("onboarding.errors.save"));
    } finally {
      setBusy(false);
    }
  };

  const copyPass = async () => {
    if (!pass?.url) return;
    const ok = await copyTextToClipboard(pass.url);
    if (!ok) {
      setError(i18n.t("onboarding.errors.copy"));
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
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

  if (dismissed || isMarketingPreview() || !isAuthenticated || skipAccessCeremony) return null;
  if (covered && !isSurveyStep(step) && step !== "share" && step !== "waiting" && step !== "choose" && step !== "pay") {
    return null;
  }

  const payAmount =
    intent && intent.totalAmountCents > 0 ? Math.round(intent.totalAmountCents / 100) : total;
  const payTotal = t("onboarding.seats.amount", { amount: formatSeatAmount(payAmount) });
  const usesLabel = t("onboarding.share.uses", { count: pass?.remainingUses ?? 1 });
  const showAccessScreen =
    !skipAccessCeremony &&
    (view === "waiting" ||
      ((view === "choose" || view === "pay") && (checkingAccess || covered)));

  return createPortal(
    <div className="seat-gate" role="dialog" aria-modal="true" aria-labelledby="seat-gate-title">
      <div className="seat-gate__backdrop" />
      <div
        className={
          showAccessScreen
            ? "seat-gate__card seat-gate__card--choose seat-gate__card--welcome"
            : isSurveyStep(view) || view === "choose" || view === "pay"
              ? "seat-gate__card seat-gate__card--plain seat-gate__card--questions"
              : "seat-gate__card seat-gate__card--plain"
        }
      >
        <div className={leaving ? "seat-gate__pane seat-gate__pane--leave" : "seat-gate__pane"}>
        {showAccessScreen ? (
          <div className="seat-gate__body seat-gate__body--flow">
            <div className="seat-gate__survey seat-gate__survey--welcome">
              <div className="seat-gate__pay-head seat-gate__pay-head--stack">
                <SeatGateBrand markOnly />
                {accessGranted ? null : (
                  <div className="app-loading-screen__spinner seat-gate__access-spinner" role="status" />
                )}
                <h2 id="seat-gate-title" className="seat-gate__title seat-gate__title--wrap">
                  {accessGranted ? t("onboarding.waiting.authorized") : t("onboarding.waiting.title")}
                </h2>
              </div>
            </div>
          </div>
        ) : isSurveyStep(view) ? (
          <div className="seat-gate__body seat-gate__body--flow">
            {SURVEY_ORDER.indexOf(view) > 0 ? (
              <button type="button" className="seat-gate__back" onClick={goBackSurvey}>
                <ChevronLeft size={16} aria-hidden />
                {t("common.back")}
              </button>
            ) : (
              <span className="seat-gate__back seat-gate__back--spacer" aria-hidden />
            )}
            <div
              key={view}
              className={questionLeaving ? "seat-gate__survey seat-gate__survey--out" : "seat-gate__survey"}
            >
            <div className="seat-gate__pay-head seat-gate__pay-head--stack">
              <h2 id="seat-gate-title" className="seat-gate__title seat-gate__title--wrap">
                {t(`onboarding.q.${view}.title`)}
              </h2>
              <p className="seat-gate__subtitle">
                {t(`onboarding.q.${view}.subtitle`)}
              </p>
            </div>
            <div className="seat-gate__fields">
                <div
                  className={view === "source" ? "seat-gate__choices seat-gate__choices--grid" : "seat-gate__choices"}
                  role="radiogroup"
                  aria-labelledby="seat-gate-title"
                >
                  {ONBOARDING_QUESTIONS.find((question) => question.id === view)?.choices.map((choice) => {
                    const selected = answers[view] === choice.id;
                    const ChoiceIcon =
                      view === "plan" && choice.id === "colleague" ? Briefcase : CHOICE_ICONS[choice.id];
                    return (
                      <button
                        key={choice.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={
                          selected
                            ? `seat-gate__choice seat-gate__choice--on${view === "source" ? " seat-gate__choice--tile" : ""}`
                            : `seat-gate__choice${view === "source" ? " seat-gate__choice--tile" : ""}`
                        }
                        onClick={() => selectAnswer(view, choice.id)}
                      >
                        {choice.icon ? (
                          <img
                            src={`${import.meta.env.BASE_URL}${choice.icon}`}
                            alt=""
                            className="seat-gate__choice-icon"
                            draggable={false}
                          />
                        ) : ChoiceIcon ? (
                          <ChoiceIcon className="seat-gate__choice-icon" size={22} strokeWidth={1.75} aria-hidden />
                        ) : null}
                        <span>{t(`onboarding.q.${view}.${choice.id}`)}</span>
                      </button>
                    );
                  })}
                </div>
              {error ? <p className="seat-gate__error">{error}</p> : null}
            </div>
            </div>
            <div className="seat-gate__pay-anchor">
              <button
                type="button"
                className="seat-gate__pay"
                disabled={busy || !answers[view]}
                onClick={() => void continueSurvey()}
              >
                {t("onboarding.continue")}
              </button>
            </div>
          </div>
        ) : view === "share" && pass?.url ? (
          <div className="seat-gate__body">
            <SeatGateBrand />
            <h2 id="seat-gate-title" className="seat-gate__title">
              {t("onboarding.share.title")}
            </h2>
            <p className="seat-gate__lead">{usesLabel} {t("onboarding.share.lead")}</p>
            <input className="seat-gate__link" readOnly value={pass.url} />
            <button type="button" className="seat-gate__pay" onClick={() => void copyPass()}>
              {copied ? t("onboarding.share.copied") : t("onboarding.share.copy")}
            </button>
            <button type="button" className="seat-gate__text-btn" onClick={() => setStep("choose")}>
              {t("onboarding.share.continue")}
            </button>
          </div>
        ) : view === "pay" && intent && stripePromise && elementsOptions ? (
          <div className="seat-gate__body seat-gate__body--flow">
            <button type="button" className="seat-gate__back" onClick={() => setStep("choose")}>
              <ChevronLeft size={16} aria-hidden />
              {t("common.back")}
            </button>
            <div className="seat-gate__pay-head">
              <h2 id="seat-gate-title" className="seat-gate__title">
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
                  paymentWait.current = true;
                  setAccessGranted(false);
                  setStep("waiting");
                }}
                submitLabel={t("onboarding.pay.pay")}
                payingLabel={t("onboarding.pay.paying")}
                pinSubmit
                afterFields={
                  <>
                    <div className="seat-gate__promo">
                      <input
                        value={promoCode}
                        placeholder={t("onboarding.pay.promo")}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(event) => {
                          setPromoCode(event.target.value);
                          setPromoMessage(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          void applyPromotion();
                        }}
                      />
                      <button
                        type="button"
                        disabled={busy || !promoCode.trim()}
                        onClick={() => void applyPromotion()}
                      >
                        {t("onboarding.pay.apply")}
                      </button>
                    </div>
                    <p className="seat-gate__mandate">
                      {t("onboarding.pay.mandate", { merchant: intent.merchantName || "Meetra" })}
                    </p>
                    {promoMessage ? <p className="seat-gate__promo-ok">{promoMessage}</p> : null}
                    {error ? <p className="seat-gate__error">{error}</p> : null}
                  </>
                }
              />
            </Elements>
          </div>
        ) : (
          <div className="seat-gate__body seat-gate__body--flow">
            <button type="button" className="seat-gate__back" onClick={() => setStep("source")}>
              <ChevronLeft size={16} aria-hidden />
              {t("common.back")}
            </button>
            <div className="seat-gate__pay-head seat-gate__pay-head--stack">
              <h2 id="seat-gate-title" className="seat-gate__title">
                {path === "join" ? t("onboarding.seats.joinTitle") : t("onboarding.seats.title")}
              </h2>
              <p className="seat-gate__subtitle">
                {path === "join" ? t("onboarding.seats.joinSubtitle") : t("onboarding.seats.subtitle")}
              </p>
            </div>
            <div className="seat-gate__fields">
            <div className="seat-gate__choices seat-gate__choices--grid" role="group" aria-label={t("onboarding.seats.paths")}>
              <button
                type="button"
                className={
                  path === "buy"
                    ? "seat-gate__choice seat-gate__choice--tile seat-gate__choice--on"
                    : "seat-gate__choice seat-gate__choice--tile"
                }
                onClick={() => {
                  setPath("buy");
                  setError(null);
                }}
              >
                <Building2 className="seat-gate__choice-icon" size={22} strokeWidth={1.75} aria-hidden />
                <span className="seat-gate__choice-copy">
                  <span>{t("onboarding.seats.group")}</span>
                  <span className="seat-gate__choice-note">{t("onboarding.seats.groupNote")}</span>
                </span>
              </button>
              <button
                type="button"
                className={
                  path === "join"
                    ? "seat-gate__choice seat-gate__choice--tile seat-gate__choice--on"
                    : "seat-gate__choice seat-gate__choice--tile"
                }
                onClick={() => {
                  setPath("join");
                  setError(null);
                }}
              >
                <UserPlus className="seat-gate__choice-icon" size={22} strokeWidth={1.75} aria-hidden />
                <span className="seat-gate__choice-copy">
                  <span>{t("onboarding.seats.join")}</span>
                  <span className="seat-gate__choice-note">{t("onboarding.seats.joinNote")}</span>
                </span>
              </button>
            </div>

            {path === "join" ? (
              <>
                <input
                  className="seat-gate__link"
                  value={joinInput}
                  placeholder={t("onboarding.seats.joinPlaceholder")}
                  onChange={(event) => setJoinInput(event.target.value)}
                />
                {error ? <p className="seat-gate__error">{error}</p> : null}
              </>
            ) : (
              <>
                <div className="seat-gate__stepper">
                  <button
                    type="button"
                    className="seat-gate__step"
                    aria-label={t("onboarding.seats.removeSeat")}
                    disabled={seats <= PERSONAL_MIN}
                    onClick={() => setSeats((current) => clampSeats(current - 1, PERSONAL_MIN))}
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
                    onClick={() => setSeats((current) => clampSeats(current + 1, PERSONAL_MIN))}
                  >
                    <Plus size={16} aria-hidden />
                  </button>
                </div>

                {error ? <p className="seat-gate__error">{error}</p> : null}
              </>
            )}
            </div>
            {path === "join" ? (
              <div className="seat-gate__pay-anchor">
                <button
                  type="button"
                  className="seat-gate__pay"
                  disabled={busy || !joinInput.trim()}
                  onClick={() => void redeemJoin(joinInput)}
                >
                  {busy ? t("onboarding.seats.verifying") : t("onboarding.seats.joinAction")}
                </button>
              </div>
            ) : (
              <div className="seat-gate__pay-anchor">
                <button type="button" className="seat-gate__pay" disabled={busy} onClick={() => void continueToPay()}>
                  {busy ? t("onboarding.seats.preparing") : t("onboarding.seats.checkout", { amount: total })}
                </button>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
