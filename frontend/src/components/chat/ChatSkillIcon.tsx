import type { ChatSkillDef } from "../../lib/chatSkills";

export default function ChatSkillIcon({ skill }: { skill: ChatSkillDef }) {
  if (skill.logo) {
    const Logo = skill.logo;
    return <Logo />;
  }

  const Icon = skill.icon;
  if (!Icon) return null;

  return <Icon size={14} className="text-muted-300" aria-hidden />;
}
