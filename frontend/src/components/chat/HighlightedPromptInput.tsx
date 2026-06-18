import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type MutableRefObject,
  type Ref,
} from "react";
import clsx from "clsx";
import {
  parseComposerHighlightSegments,
  type ComposerSkillMode,
} from "../../lib/skillPromptSegments";

const MIN_ROWS = 1;
const MAX_ROWS = 8;

/** Même rendu que l’ancien textarea du ChatPanel (12px, interligne 22px). */
const FIELD_TEXT =
  "font-sans text-[12px] leading-[22px] tracking-normal px-0.5 pt-0 pb-[2px] -translate-y-px";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  peopleHandles?: string[];
  composerSkill?: ComposerSkillMode;
  onClick?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyUp?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  className?: string;
}

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const r of refs) {
      if (!r) continue;
      if (typeof r === "function") r(node);
      else (r as MutableRefObject<T | null>).current = node;
    }
  };
}

const HighlightedPromptInput = forwardRef<HTMLTextAreaElement, Props>(function HighlightedPromptInput(
  {
    value,
    onChange,
    placeholder,
    peopleHandles = [],
    composerSkill = null,
    onClick,
    onFocus,
    onBlur,
    onKeyUp,
    onKeyDown,
    className,
  },
  ref,
) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);

  const syncScroll = useCallback(() => {
    const ta = innerRef.current;
    if (mirrorRef.current && ta) {
      mirrorRef.current.scrollTop = ta.scrollTop;
      mirrorRef.current.scrollLeft = ta.scrollLeft;
    }
  }, []);

  const resize = useCallback(() => {
    const ta = innerRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 22;
    const minH = lineHeight * MIN_ROWS;
    const maxH = lineHeight * MAX_ROWS;
    const next = Math.min(Math.max(ta.scrollHeight, minH), maxH);
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > maxH ? "auto" : "hidden";
    if (wrapRef.current) wrapRef.current.style.minHeight = `${next}px`;
    syncScroll();
  }, [syncScroll]);

  useLayoutEffect(() => {
    const ta = innerRef.current;
    const pending = pendingSelectionRef.current;
    if (ta && pending) {
      pendingSelectionRef.current = null;
      const start = Math.min(pending.start, value.length);
      const end = Math.min(pending.end, value.length);
      ta.setSelectionRange(start, end);
    }
    resize();
  }, [value, resize]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [resize]);

  const segments = parseComposerHighlightSegments(value, peopleHandles, composerSkill);

  return (
    <div ref={wrapRef} className={clsx("relative w-full min-h-[calc(22px+2px)]", className)}>
      <div
        ref={mirrorRef}
        aria-hidden
        className={clsx(
          "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words",
          FIELD_TEXT,
        )}
      >
        {value ? (
          segments.map((seg, i) =>
            seg.kind === "mention" ? (
              <span key={i} className="prompt-mention">
                {seg.text}
              </span>
            ) : seg.kind === "skillChip" && seg.text.length > 0 ? (
              <span key={i} className="prompt-skill-chip">
                {seg.text}
              </span>
            ) : seg.kind === "skillChip" ? null : (
              <span key={i} className="text-muted-200">
                {seg.text}
              </span>
            ),
          )
        ) : (
          <span className="text-muted-500">{placeholder}</span>
        )}
      </div>
      <textarea
        ref={mergeRefs(ref, innerRef)}
        value={value}
        onChange={(e) => {
          pendingSelectionRef.current = {
            start: e.target.selectionStart ?? e.target.value.length,
            end: e.target.selectionEnd ?? e.target.value.length,
          };
          onChange(e.target.value);
        }}
        onClick={() => {
          syncScroll();
          onClick?.();
        }}
        onFocus={() => onFocus?.()}
        onBlur={() => onBlur?.()}
        onKeyUp={() => {
          syncScroll();
          onKeyUp?.();
        }}
        onScroll={syncScroll}
        onKeyDown={onKeyDown}
        rows={MIN_ROWS}
        placeholder=""
        spellCheck={false}
        className={clsx(
          "relative z-[1] block w-full min-h-[calc(22px+2px)] resize-none overflow-hidden bg-transparent text-transparent caret-muted-200 selection:bg-muted-400/25 focus:outline-none disabled:opacity-50",
          FIELD_TEXT,
        )}
      />
    </div>
  );
});

export default HighlightedPromptInput;
