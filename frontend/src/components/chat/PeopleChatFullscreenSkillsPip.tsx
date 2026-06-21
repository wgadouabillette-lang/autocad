import { useStore } from "../../store/useStore";
import { usePeopleChatSkillsOverlayStore } from "../../store/usePeopleChatSkillsOverlayStore";
import PeopleChatFullscreenSkills from "./PeopleChatFullscreenSkills";

export default function PeopleChatFullscreenSkillsPip() {
  const chatPanelExpanded = useStore((s) => s.chatPanelExpanded);
  const chatPanelLeaveAnimating = useStore((s) => s.chatPanelLeaveAnimating);
  const chatPanelMode = useStore((s) => s.chatPanelMode);
  const visible = usePeopleChatSkillsOverlayStore((s) => s.visible);
  const skills = usePeopleChatSkillsOverlayStore((s) => s.skills);
  const activeIndex = usePeopleChatSkillsOverlayStore((s) => s.activeIndex);
  const onActiveIndexChange = usePeopleChatSkillsOverlayStore((s) => s.onActiveIndexChange);
  const onSelect = usePeopleChatSkillsOverlayStore((s) => s.onSelect);

  const isOverlay = chatPanelExpanded || chatPanelLeaveAnimating;
  if (!isOverlay || chatPanelMode !== "friends" || !visible) return null;

  return (
    <PeopleChatFullscreenSkills
      skills={skills}
      activeIndex={activeIndex}
      onActiveIndexChange={onActiveIndexChange}
      onSelect={onSelect}
    />
  );
}
