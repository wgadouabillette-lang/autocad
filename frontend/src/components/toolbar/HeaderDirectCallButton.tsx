import { ArrowLeft, Calendar, Check, Copy, PhoneIncoming, Plus, X, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import CalendarEventComposer from "../calendar/CalendarEventComposer";
import { copyTextToClipboard } from "../../lib/clipboard";
import { useDirectCallStore } from "../../store/useDirectCallStore";

const DIRECT_CALL_ACTIONS: { id: "join" | "start" | "schedule"; icon: LucideIcon }[] = [
  { id: "join", icon: PhoneIncoming },
  { id: "start", icon: Plus },
  { id: "schedule", icon: Calendar },
];

type DirectCallStep = "home" | "join" | "schedule";

/** Capsule 1:1, juste après Upgrade. */
export default function HeaderDirectCallButton() {
  const { t } = useTranslation();
  const callId = useDirectCallStore((s) => s.callId);
  const startCall = useDirectCallStore((s) => s.startCall);
  const joinCall = useDirectCallStore((s) => s.joinCall);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<DirectCallStep>("home");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);

  const close = () => {
    setOpen(false);
    setStep("home");
    setLink("");
  };

  const back = () => setStep("home");

  const enterCall = () => {
    startCall();
    close();
  };

  const submitLink = () => {
    if (!joinCall(link)) return;
    close();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    setCopied(false);
  }, [callId]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyId = async () => {
    if (!callId) return;
    const ok = await copyTextToClipboard(callId);
    if (ok) setCopied(true);
  };

  if (callId) {
    return (
      <button
        type="button"
        className={
          copied
            ? "header-upgrade-capsule direct-call-id-capsule is-copied"
            : "header-upgrade-capsule direct-call-id-capsule"
        }
        aria-label={copied ? t("directCall.copied") : t("directCall.copyId", { id: callId })}
        onClick={() => void copyId()}
      >
        <span key={copied ? "copied" : "id"} className="direct-call-id-capsule__face">
          {copied ? (
            <>
              <Check size={12} strokeWidth={2.4} aria-hidden />
              <span className="header-upgrade-capsule__label">{t("directCall.copied")}</span>
            </>
          ) : (
            <>
              <span className="header-upgrade-capsule__label">{callId}</span>
              <Copy size={12} strokeWidth={2} aria-hidden />
            </>
          )}
        </span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className={open ? "header-upgrade-capsule is-active" : "header-upgrade-capsule"}
        aria-label="1:1"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setStep("home");
          setOpen(true);
        }}
      >
        <span className="header-upgrade-capsule__label">1:1</span>
      </button>
      {open
        ? createPortal(
            <div
              className="seat-gate"
              role="dialog"
              aria-modal="true"
              aria-labelledby={
                step === "join"
                  ? "direct-call-paste-title"
                  : step === "schedule"
                    ? "direct-call-schedule-title"
                    : "direct-call-title"
              }
            >
              <div className="seat-gate__backdrop" onClick={close} />
              <div className="seat-gate__card seat-gate__card--plain">
                {step !== "home" ? (
                  <button
                    type="button"
                    className="direct-call__back"
                    aria-label={t("common.back")}
                    onClick={back}
                  >
                    <ArrowLeft size={18} aria-hidden />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="direct-call__close"
                  aria-label={t("common.close")}
                  onClick={close}
                >
                  <X size={18} aria-hidden />
                </button>
                {step === "join" ? (
                  <form
                    className="direct-call direct-call--join"
                    onSubmit={(event) => {
                      event.preventDefault();
                      submitLink();
                    }}
                  >
                    <div className="direct-call__join-head">
                      <h2 id="direct-call-paste-title" className="direct-call__title">
                        {t("directCall.pasteTitle")}
                      </h2>
                      <p className="direct-call__subtitle">{t("directCall.pasteSubtitle")}</p>
                    </div>
                    <input
                      className="direct-call__join"
                      value={link}
                      onChange={(event) => setLink(event.target.value)}
                      placeholder={t("directCall.joinPlaceholder")}
                      aria-label={t("directCall.joinPlaceholder")}
                      autoFocus
                    />
                  </form>
                ) : step === "schedule" ? (
                  <div className="direct-call direct-call--schedule">
                    <h2 id="direct-call-schedule-title" className="direct-call__title">
                      {t("directCall.scheduleTitle")}
                    </h2>
                    <p className="direct-call__subtitle">{t("directCall.scheduleSubtitle")}</p>
                    <div className="direct-call__schedule">
                      <CalendarEventComposer plain onDismiss={close} />
                    </div>
                    <p className="direct-call__schedule-note">{t("directCall.scheduleIdLater")}</p>
                  </div>
                ) : (
                  <div className="direct-call">
                    <h2 id="direct-call-title" className="direct-call__title">
                      {t("directCall.title")}
                    </h2>
                    <p className="direct-call__subtitle">{t("directCall.subtitle")}</p>
                    <div className="direct-call__actions">
                      {DIRECT_CALL_ACTIONS.map(({ id, icon: Icon }) => (
                        <button
                          key={id}
                          type="button"
                          className="direct-call__action"
                          onClick={() => {
                            if (id === "start") enterCall();
                            else setStep(id);
                          }}
                        >
                          <Icon className="direct-call__action-icon" size={22} strokeWidth={1.75} aria-hidden />
                          <span className="direct-call__action-title">{t(`directCall.${id}`)}</span>
                          <span className="direct-call__action-note">{t(`directCall.${id}Note`)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
