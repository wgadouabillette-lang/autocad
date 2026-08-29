import { create } from "zustand";

interface AgentSkillApplyState {
  pending: { nonce: number; skillId: string } | null;
  applySkill: (skillId: string) => void;
  takePending: () => { nonce: number; skillId: string } | null;
}

export const useAgentSkillApplyStore = create<AgentSkillApplyState>((set, get) => ({
  pending: null,
  applySkill: (skillId) => set({ pending: { nonce: Date.now(), skillId } }),
  takePending: () => {
    const pending = get().pending;
    if (!pending) return null;
    set({ pending: null });
    return pending;
  },
}));
