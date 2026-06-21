import clsx from "clsx";
import type { ChatSkillDef } from "../../lib/chatSkills";
import { hasRecapSkillAccess } from "../../lib/subscriptionPlans";
import { useStore } from "../../store/useStore";
import ChatSkillIcon from "./ChatSkillIcon";

interface ChatSkillsListProps {
  skills: ChatSkillDef[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (skill: ChatSkillDef) => void;
}

export default function ChatSkillsList({
  skills,
  activeIndex,
  onActiveIndexChange,
  onSelect,
}: ChatSkillsListProps) {
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const hasPaidPlan = hasRecapSkillAccess(
    subscriptionPlan,
    billingManaged,
    workspaceEnterpriseActive,
  );

  return (
    <div
      className="chat-connectors-list chat-connectors-list--from-bottom chat-skills-list"
      role="listbox"
      aria-label="Skills"
    >
      {skills.map((skill, index) => {
        return (
          <button
            key={skill.id}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            onMouseEnter={() => onActiveIndexChange(index)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        onSelect(skill);
                      }}
                      onClick={(event) => event.preventDefault()}
            className={clsx(
              "chat-connectors-row chat-skills-row",
              index === activeIndex && "chat-skills-row--active",
            )}
            style={{ animationDelay: `${(skills.length - 1 - index) * 55}ms` }}
          >
            <span className="chat-connectors-row__main">
              <span
                className={clsx(
                  "chat-connectors-row__icon",
                  skill.logo && "chat-connectors-row__icon--logo",
                )}
              >
                <ChatSkillIcon skill={skill} />
              </span>
              <span className="chat-connectors-row__label-wrap">
                <span className="chat-connectors-row__label">{skill.label}</span>
                <span className="chat-connectors-row__meta">{skill.description}</span>
              </span>
            </span>
            {skill.requiresPaidPlan && !hasPaidPlan ? (
              <span className="chat-skills-pro-badge">Pro</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
