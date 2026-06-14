import clsx from "clsx";
import {
  AI_MODEL_SPEED_LABELS,
  MODEL_SELECTOR_GAP_CLASS,
  MODEL_SELECTOR_ICON_CLASS,
  MODEL_SELECTOR_SPEED_CLASS,
  type AiModelDisplay,
  type AiModelSpeed,
} from "../../lib/aiModels";
import { AiModelIcon } from "./aiModelLogos";

type AiModelSelectorLabelProps = AiModelDisplay & {
  className?: string;
  iconClassName?: string;
  nameClassName?: string;
  speedClassName?: string;
};

/** Libellé le plus long — réserve la même largeur en mode compact. */
const SPEED_LAYOUT_LABEL: Record<AiModelSpeed, string> = {
  fast: AI_MODEL_SPEED_LABELS.reasoning,
  medium: AI_MODEL_SPEED_LABELS.reasoning,
  reasoning: AI_MODEL_SPEED_LABELS.reasoning,
};

export default function AiModelSelectorLabel({
  name,
  speed,
  icon,
  compact = false,
  hideSpeedSlot = false,
  className,
  iconClassName = MODEL_SELECTOR_ICON_CLASS,
  nameClassName = "text-muted-300",
  speedClassName = "text-muted-500",
}: AiModelSelectorLabelProps) {
  const speedText = compact ? SPEED_LAYOUT_LABEL[speed] : AI_MODEL_SPEED_LABELS[speed];
  const showSpeed = !hideSpeedSlot;

  return (
    <span
      className={clsx(
        "inline-flex min-h-4 items-center justify-start leading-none",
        MODEL_SELECTOR_GAP_CLASS,
        className,
      )}
    >
      {icon ? (
        <span className={clsx("inline-flex shrink-0 items-center justify-center", iconClassName)}>
          <AiModelIcon icon={icon} />
        </span>
      ) : null}
      <span className={clsx("shrink-0", nameClassName)}>{name}</span>
      {showSpeed ? (
        <span
          className={clsx(
            speedClassName,
            MODEL_SELECTOR_SPEED_CLASS,
            compact && "invisible select-none",
          )}
          aria-hidden={compact}
        >
          {speedText}
        </span>
      ) : null}
    </span>
  );
}
