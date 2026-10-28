import clsx from "clsx";
import { CHAT_SKILLS } from "../../lib/chatSkills";
import ChatSkillIcon from "../chat/ChatSkillIcon";

export default function SkillsSettingsSection() {
  return (
    <section className="settings-section">
      <div className="chat-connectors-list chat-connectors-list--settings" role="list">
        {CHAT_SKILLS.map((skill) => (
          <div key={skill.id} className="chat-connectors-row" role="listitem">
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
            {skill.requiresPaidPlan ? <span className="chat-skills-pro-badge">Pro</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
