import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AI_MODELS,
  MODEL_SELECTOR_CHEVRON_GAP_CLASS,
  composerModelDisplay,
  modelOptionDisplay,
  type AiModel,
} from "../../lib/aiModels";
import { useStore } from "../../store/useStore";
import AiModelSelectorLabel from "./AiModelSelectorLabel";

interface MenuPosition {
  top: number;
  left: number;
  minWidth: number;
}

const MENU_MIN_WIDTH = 184;
const MENU_GAP = 6;

export default function AiModelSelector() {
  const aiModel = useStore((s) => s.aiModel);
  const setAiModel = useStore((s) => s.setAiModel);
  const activeChatTabId = useStore((s) => s.activeChatTabId);
  const modelDisplay = composerModelDisplay(aiModel);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPosition = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    let left = rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - MENU_MIN_WIDTH - 8));
    setMenuPos({
      top: rect.top - MENU_GAP,
      left,
      minWidth: MENU_MIN_WIDTH,
    });
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [activeChatTabId]);

  useEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
    const onLayout = () => updateMenuPosition();
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            className="chat-composer-floating-menu min-w-[11.5rem]"
            style={{
              top: menuPos.top,
              left: menuPos.left,
              minWidth: menuPos.minWidth,
              transform: "translateY(-100%)",
            }}
            role="listbox"
            aria-label="Choisir un modèle IA"
          >
            {AI_MODELS.map((model) => {
              const option = modelOptionDisplay(model.id);
              return (
                <button
                  key={model.id}
                  type="button"
                  role="option"
                  aria-selected={aiModel === model.id}
                  onClick={() => {
                    setAiModel(model.id as AiModel);
                    setOpen(false);
                  }}
                  className={clsx(
                    "chat-composer-floating-menu__item chat-composer-floating-menu__item--compact w-full min-w-0 text-xs",
                    aiModel === model.id && "chat-composer-floating-menu__item--active",
                  )}
                >
                  <span className="chat-composer-floating-menu__body min-w-0">
                    <AiModelSelectorLabel
                    {...option}
                    nameClassName={aiModel === model.id ? "text-muted-100" : "text-muted-300"}
                    speedClassName="text-muted-500"
                  />
                  </span>
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div className="relative shrink-0" ref={rootRef}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="listbox"
          className={clsx(
            "inline-flex min-h-[24px] items-center justify-start bg-transparent px-0 py-0 text-[11px] font-medium leading-none hover:text-muted-200",
            aiModel === "auto" && "-translate-y-[3px]",
            MODEL_SELECTOR_CHEVRON_GAP_CLASS,
          )}
        >
          <AiModelSelectorLabel
            {...modelDisplay}
            nameClassName={aiModel === "auto" ? "text-muted-100" : "text-muted-300"}
          />
          <ChevronDown
            size={12}
            className={aiModel === "auto" ? "text-muted-500" : "text-muted-400 opacity-70"}
          />
        </button>
      </div>
      {menu}
    </>
  );
}
