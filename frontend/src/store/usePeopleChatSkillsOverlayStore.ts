import { create } from "zustand";
import type { ChatSkillDef } from "../lib/chatSkills";

interface PeopleChatSkillsOverlayState {
  visible: boolean;
  skills: ChatSkillDef[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (skill: ChatSkillDef) => void;
  syncOverlay: (payload: {
    skills: ChatSkillDef[];
    activeIndex: number;
    onActiveIndexChange: (index: number) => void;
    onSelect: (skill: ChatSkillDef) => void;
  } | null) => void;
}

const noop = () => {};

export const usePeopleChatSkillsOverlayStore = create<PeopleChatSkillsOverlayState>((set) => ({
  visible: false,
  skills: [],
  activeIndex: 0,
  onActiveIndexChange: noop,
  onSelect: noop,

  syncOverlay: (payload) => {
    if (!payload) {
      set({
        visible: false,
        skills: [],
        activeIndex: 0,
        onActiveIndexChange: noop,
        onSelect: noop,
      });
      return;
    }
    set({
      visible: true,
      skills: payload.skills,
      activeIndex: payload.activeIndex,
      onActiveIndexChange: payload.onActiveIndexChange,
      onSelect: payload.onSelect,
    });
  },
}));
