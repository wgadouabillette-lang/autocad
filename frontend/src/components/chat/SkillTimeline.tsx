import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Check, CircleAlert, Loader2, Square } from "lucide-react";
import clsx from "clsx";

export interface SkillTimelineStep {
  id: string;
  label: string;
  minMs: number;
  maxMs?: number;
}

export interface SkillTimelineSuccessAction {
  label: string;
  onClick: () => void;
}

export interface SkillTimelineSuccess {
  label: string;
  action?: SkillTimelineSuccessAction;
}

interface SkillTimelineProps {
  steps: SkillTimelineStep[];
  /** True when the underlying operation has finished successfully. */
  apiDone?: boolean;
  /** Non-null when the underlying operation has failed. */
  apiError?: string | null;
  /** Success card to render once animation + API are complete. */
  success?: SkillTimelineSuccess | null;
  /** Click handler for the per-step Stop button. Hides the button if not provided. */
  onStop?: () => void;
}

function pickDuration(step: SkillTimelineStep): number {
  const min = Math.max(0, step.minMs);
  const max = step.maxMs ?? min;
  if (max <= min) return min;
  return Math.round(min + Math.random() * (max - min));
}

type Phase = "animating" | "success" | "error";

export default function SkillTimeline({
  steps,
  apiDone = false,
  apiError = null,
  success,
  onStop,
}: SkillTimelineProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("animating");

  const durationsRef = useRef<number[]>([]);
  if (durationsRef.current.length !== steps.length) {
    durationsRef.current = steps.map(pickDuration);
  }

  const apiDoneRef = useRef(apiDone);
  apiDoneRef.current = apiDone;
  const apiErrorRef = useRef(apiError);
  apiErrorRef.current = apiError;
  const lastStepTimerFiredRef = useRef(false);

  useEffect(() => {
    if (phase !== "animating") return;
    if (activeIdx >= steps.length) {
      setPhase(apiErrorRef.current ? "error" : "success");
      return;
    }

    const isLast = activeIdx === steps.length - 1;
    const duration = durationsRef.current[activeIdx] ?? 1500;
    if (isLast) lastStepTimerFiredRef.current = false;

    const id = window.setTimeout(() => {
      if (isLast) {
        lastStepTimerFiredRef.current = true;
        if (apiDoneRef.current || apiErrorRef.current) {
          setActiveIdx((i) => i + 1);
        }
      } else {
        setActiveIdx((i) => i + 1);
      }
    }, duration);

    return () => window.clearTimeout(id);
  }, [activeIdx, phase, steps.length]);

  useEffect(() => {
    if (phase !== "animating") return;
    if (activeIdx === steps.length - 1 && lastStepTimerFiredRef.current) {
      if (apiDone || apiError) {
        setActiveIdx((i) => i + 1);
      }
    }
  }, [apiDone, apiError, phase, activeIdx, steps.length]);

  const showCompleted = phase === "success" || phase === "error";

  return (
    <div className="skill-timeline" role="status" aria-live="polite">
      {steps.map((step, i) => {
        const isAfterAnimation = showCompleted;
        if (!isAfterAnimation && i > activeIdx) return null;
        const completed = isAfterAnimation || i < activeIdx;
        const active = !isAfterAnimation && i === activeIdx;
        return (
          <div
            key={step.id}
            className={clsx(
              "skill-timeline__row",
              completed && "skill-timeline__row--completed",
              active && "skill-timeline__row--active",
            )}
          >
            {completed ? (
              <Check size={12} className="skill-timeline__check" aria-hidden />
            ) : (
              <Loader2 size={12} className="skill-timeline__spinner animate-spin" aria-hidden />
            )}
            <span className="skill-timeline__label">
              {active ? <span className="text-shimmer">{step.label}</span> : step.label}
            </span>
            {active && onStop ? (
              <button
                type="button"
                onClick={onStop}
                className="skill-timeline__stop chat-connectors-row__connect"
              >
                <Square
                  size={9}
                  strokeWidth={2.25}
                  className="shrink-0 fill-current opacity-80"
                  aria-hidden
                />
                <span>Stop</span>
              </button>
            ) : null}
          </div>
        );
      })}
      {phase === "success" && success ? (
        <SkillSuccessCard label={success.label} action={success.action} />
      ) : null}
      {phase === "error" && apiError ? <SkillErrorCard error={apiError} /> : null}
    </div>
  );
}

function SkillSuccessCard({
  label,
  action,
}: {
  label: string;
  action?: SkillTimelineSuccessAction;
}): ReactNode {
  return (
    <div className="skill-success" role="status" aria-live="polite">
      <span className="skill-success__check">
        <Check size={12} strokeWidth={2.5} aria-hidden />
      </span>
      <span className="skill-success__label">{label}</span>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="skill-success__action chat-connectors-row__connect"
        >
          <span>{action.label}</span>
          <ArrowUpRight
            size={11}
            strokeWidth={2.25}
            className="shrink-0 opacity-80"
            aria-hidden
          />
        </button>
      ) : null}
    </div>
  );
}

function SkillErrorCard({ error }: { error: string }): ReactNode {
  return (
    <div className="skill-error" role="alert">
      <CircleAlert size={12} className="skill-error__icon" aria-hidden />
      <span className="skill-error__label">{error}</span>
    </div>
  );
}
