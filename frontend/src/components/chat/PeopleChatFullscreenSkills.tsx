import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import type { ChatSkillDef } from "../../lib/chatSkills";
import ChatSkillIcon from "./ChatSkillIcon";

interface PeopleChatFullscreenSkillsProps {
  skills: ChatSkillDef[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (skill: ChatSkillDef) => void;
}

export default function PeopleChatFullscreenSkills({
  skills,
  activeIndex,
  onActiveIndexChange,
  onSelect,
}: PeopleChatFullscreenSkillsProps) {
  if (skills.length === 0) return null;

  return (
    <div className="people-chat-fullscreen-skills" aria-label="Skills">
      <div className="people-chat-fullscreen-skills__stack" role="listbox" aria-label="Skills">
        {skills.map((skill, index) => {
          return (
            <div
              key={skill.id}
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => onActiveIndexChange(index)}
              className={clsx(
                "people-chat-fullscreen-skills__card",
                index === activeIndex && "people-chat-fullscreen-skills__card--active",
              )}
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <span className="people-chat-fullscreen-skills__card-main">
                <span
                  className={clsx(
                    "people-chat-fullscreen-skills__card-icon",
                    skill.logo && "people-chat-fullscreen-skills__card-icon--logo",
                  )}
                >
                  <ChatSkillIcon skill={skill} />
                </span>
                <span className="people-chat-fullscreen-skills__card-copy">
                  <span className="people-chat-fullscreen-skills__card-label">{skill.label}</span>
                  <span className="people-chat-fullscreen-skills__card-meta">{skill.description}</span>
                </span>
              </span>
              <button
                type="button"
                className="chat-connectors-row__connect people-chat-fullscreen-skills__use"
                onClick={() => onSelect(skill)}
              >
                Use
                <ArrowUpRight size={11} strokeWidth={2.25} className="shrink-0 opacity-80" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
