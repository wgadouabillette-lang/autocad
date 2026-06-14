import clsx from "clsx";
import { ChevronUp, Loader2, Check, X, Circle } from "lucide-react";
import { activeStepLabel, type AiRun } from "../lib/aiRun";
import { workModeDef } from "../lib/workModes";
import { aiModelLabel } from "../lib/aiModels";

interface Props {
  run: AiRun;
  onToggleExpand: () => void;
  onStop?: () => void;
}

function StepIcon({ status }: { status: AiRun["steps"][0]["status"] }) {
  if (status === "active") return <Loader2 size={12} className="animate-spin text-muted-400" />;
  if (status === "done") return <Check size={12} className="text-muted-300" />;
  if (status === "error") return <X size={12} className="text-red-400" />;
  return <Circle size={10} className="text-muted-600" />;
}

function ShimmerText({ children, className }: { children: string; className?: string }) {
  return (
    <span className={clsx("relative inline-block max-w-full", className)}>
      <span className="block truncate font-[inherit] leading-[inherit] invisible" aria-hidden>
        {children}
      </span>
      <span className="absolute inset-0 truncate font-[inherit] leading-[inherit] text-shimmer">
        {children}
      </span>
    </span>
  );
}

function RunTitle({ run, compact }: { run: AiRun; compact: boolean }) {
  const isRunning = run.status === "running";
  const isError = run.status === "error";

  if (compact) {
    const label = isRunning ? activeStepLabel(run) : run.summary;
    return (
      <p
        className={clsx(
          "min-w-0 truncate text-[11px] font-medium leading-tight",
          isError && "text-red-300",
          !isRunning && !isError && "text-muted-200",
        )}
      >
        {isRunning ? <ShimmerText className="text-[11px] font-medium leading-tight">{label}</ShimmerText> : label}
      </p>
    );
  }

  return (
    <>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-500">
        {isRunning ? "In progress" : isError ? "Error" : run.status === "cancelled" ? "Stopped" : "Done"}
        {" · "}
        {workModeDef(run.workMode).label}
      </p>
      <p
        className={clsx(
          "mt-0.5 min-w-0 truncate text-xs font-medium leading-snug",
          isError && "text-red-300",
          run.status === "cancelled" && "text-muted-400",
          !isRunning && !isError && run.status !== "cancelled" && "text-muted-200",
        )}
      >
        {isRunning ? (
          <ShimmerText className="text-xs font-medium leading-snug">{activeStepLabel(run)}</ShimmerText>
        ) : (
          run.summary
        )}
      </p>
    </>
  );
}

function StopButton({ onStop }: { onStop: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onStop();
      }}
      className="mt-0.5 shrink-0 self-start text-[11px] font-medium leading-tight text-muted-400 transition-colors hover:text-muted-200"
    >
      Stop
    </button>
  );
}

export default function AiRunPanel({ run, onToggleExpand, onStop }: Props) {
  const isFull = run.expand === "full";
  const isRunning = run.status === "running";
  const showStop = isRunning && onStop;

  if (isFull) {
    return (
      <div className="px-3 py-2.5">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex min-w-0 flex-1 items-start gap-2 text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-ink-500"
          >
            <ChevronUp
              size={14}
              className="mt-0.5 shrink-0 rotate-180 text-muted-500 transition-transform duration-300"
            />
            <div className="mt-0.5 min-w-0 flex-1">
              <RunTitle run={run} compact={false} />
            </div>
          </button>
          {showStop && <StopButton onStop={onStop} />}
        </div>

        <div className="mt-3 space-y-3 border-t border-ink-700/80 pt-3">
          <div>
            <p className="text-[10px] font-medium text-muted-500">Your request</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-300">{run.prompt}</p>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-medium text-muted-500">Steps</p>
            <ul className="space-y-1.5">
              {run.steps.map((step) => (
                <li key={step.id} className="flex gap-2 text-xs">
                  <span className="mt-0.5 shrink-0">
                    <StepIcon status={step.status} />
                  </span>
                  <span className="min-w-0">
                    <span className="text-muted-200">{step.label}</span>
                    {step.detail && (
                      <span className="mt-0.5 block text-[10px] text-muted-500">{step.detail}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {run.message && (
            <div>
              <p className="text-[10px] font-medium text-muted-500">Response</p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-300">
                {run.message}
              </p>
            </div>
          )}

          <p className="text-[10px] text-muted-600">
            {aiModelLabel(run.aiModel)}
            {run.source ? ` · ${run.source}` : ""}
            {run.finishedAt
              ? ` · ${Math.round((run.finishedAt - run.startedAt) / 1000)}s`
              : ""}
          </p>
        </div>
      </div>
    );
  }

  if (isRunning) {
    return (
      <div className="flex h-[50px] items-start gap-2 px-2.5 pb-1 pt-2">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex min-w-0 flex-1 items-start gap-2 text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-ink-500"
        >
          <ChevronUp size={14} className="mt-0.5 shrink-0 text-muted-500" />
          <div className="mt-0.5 min-w-0 flex-1">
            <RunTitle run={run} compact />
          </div>
        </button>
        {showStop && <StopButton onStop={onStop} />}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggleExpand}
      className="block w-full text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-ink-500"
    >
      <div className="flex h-[50px] items-start gap-2 px-2.5 pb-1 pt-2">
        <ChevronUp size={14} className="mt-0.5 shrink-0 text-muted-500" />
        <div className="mt-0.5 min-w-0 flex-1">
          <RunTitle run={run} compact />
        </div>
      </div>
    </button>
  );
}
