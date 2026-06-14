import { create } from "zustand";

export type WorkspaceOnboardingStep = "choice" | "join" | "create";

interface WorkspaceOnboardingState {
  open: boolean;
  step: WorkspaceOnboardingStep;
  openOnboarding: () => void;
  closeOnboarding: () => void;
  setStep: (step: WorkspaceOnboardingStep) => void;
}

export const useWorkspaceOnboardingStore = create<WorkspaceOnboardingState>((set) => ({
  open: false,
  step: "choice",
  openOnboarding: () => set({ open: true, step: "choice" }),
  closeOnboarding: () => set({ open: false, step: "choice" }),
  setStep: (step) => set({ step }),
}));
