import { useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import { filterChatSkillsForSlashMenu } from "../../lib/chatSkills";
import { isRecordingSession } from "../../lib/chatSessionKinds";
import { hasRecapSkillAccess } from "../../lib/subscriptionPlans";
import { useAgentSkillApplyStore } from "../../store/useAgentSkillApplyStore";
import { useStore } from "../../store/useStore";

export default function AgentFullscreenSkills() {
  const chatPanelExpanded = useStore((s) => s.chatPanelExpanded);
  const chatPanelLeaveAnimating = useStore((s) => s.chatPanelLeaveAnimating);
  const chatPanelMode = useStore((s) => s.chatPanelMode);
  const showChatHistory = useStore((s) => s.showChatHistory);
  const activeChatTabId = useStore((s) => s.activeChatTabId);
  const openChatTabs = useStore((s) => s.openChatTabs);
  const chatSessions = useStore((s) => s.chatSessions);
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const applySkill = useAgentSkillApplyStore((s) => s.applySkill);
  const navRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrolledFromTop, setScrolledFromTop] = useState(false);

  const skills = useMemo(() => {
    const list = filterChatSkillsForSlashMenu("");
    return [...list].sort(
      (a, b) => Number(Boolean(b.requiresPaidPlan)) - Number(Boolean(a.requiresPaidPlan)),
    );
  }, []);
  const hasPaidPlan = hasRecapSkillAccess(
    subscriptionPlan,
    billingManaged,
    workspaceEnterpriseActive,
  );

  const activeSession =
    openChatTabs.find((tab) => tab.id === activeChatTabId) ??
    chatSessions.find((session) => session.id === activeChatTabId);
  const showRecordingPlayback = isRecordingSession(activeSession);

  const visible =
    chatPanelExpanded &&
    !chatPanelLeaveAnimating &&
    chatPanelMode === "agent" &&
    !showChatHistory &&
    !showRecordingPlayback;

  useLayoutEffect(() => {
    if (!visible) return;
    const nav = navRef.current;
    if (!nav) return;
    const panel = nav.closest(".chat-panel");
    if (!(panel instanceof HTMLElement)) return;

    const syncTop = () => {
      const content = panel.querySelector(".chat-panel__content");
      if (!(content instanceof HTMLElement)) {
        nav.style.removeProperty("top");
        return;
      }
      const top =
        content.getBoundingClientRect().top - panel.getBoundingClientRect().top;
      nav.style.top = `${Math.max(0, top)}px`;
    };

    syncTop();
    const observer = new ResizeObserver(syncTop);
    observer.observe(panel);
    const content = panel.querySelector(".chat-panel__content");
    const tabs = panel.querySelector(".chat-panel-mode-tabs");
    if (content instanceof HTMLElement) observer.observe(content);
    if (tabs instanceof HTMLElement) observer.observe(tabs);
    window.addEventListener("resize", syncTop);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncTop);
    };
  }, [visible]);

  useLayoutEffect(() => {
    if (!visible) {
      setScrolledFromTop(false);
      return;
    }
    const el = scrollerRef.current;
    if (!el) return;
    const syncTopFade = () => setScrolledFromTop(el.scrollTop > 0);
    syncTopFade();
    el.addEventListener("scroll", syncTopFade, { passive: true });
    return () => el.removeEventListener("scroll", syncTopFade);
  }, [visible]);

  if (!visible) return null;

  return (
    <aside
      ref={navRef}
      className="agent-fullscreen-skills"
      aria-label="Skills"
    >
      <div
        ref={scrollerRef}
        className={clsx(
          "agent-fullscreen-skills__card",
          scrolledFromTop && "agent-fullscreen-skills__card--scrolled",
        )}
      >
        <div className="agent-fullscreen-skills__stack">
          {skills.map((skill) => {
            const showPro = Boolean(skill.requiresPaidPlan && !hasPaidPlan);
            return (
              <button
                key={skill.id}
                type="button"
                className={clsx(
                  "agent-fullscreen-skills__frame",
                  skill.requiresPaidPlan && "agent-fullscreen-skills__frame--pro",
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  applySkill(skill.id);
                }}
                onClick={(event) => event.preventDefault()}
              >
                <span className="agent-fullscreen-skills__copy">
                  <span className="agent-fullscreen-skills__title">
                    <span>{skill.label}</span>
                    {showPro ? (
                      <span className="chat-skills-pro-badge">Pro</span>
                    ) : null}
                  </span>
                  <span className="agent-fullscreen-skills__meta">
                    {skill.description}
                  </span>
                </span>
                <span className="agent-fullscreen-skills__go" aria-hidden>
                  <ArrowUpRight size={12} strokeWidth={2.25} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
