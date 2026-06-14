import clsx from "clsx";
import { ArrowLeft, LayoutGrid, Plus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { workspaceInitials } from "../../lib/workspaces";
import { useAuthStore } from "../../store/useAuthStore";
import { useStore } from "../../store/useStore";
import {
  useWorkspaceOnboardingStore,
  type WorkspaceOnboardingStep,
} from "../../store/useWorkspaceOnboardingStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";

async function finishWorkspaceSetup() {
  await useAuthStore.getState().syncWorkspacesToCloud();
  await useAuthStore.getState().markWorkspaceSetupCompleted();
  useWorkspaceOnboardingStore.getState().closeOnboarding();
  useStore.getState().openAgentPanel();
}

export default function WorkspaceOnboardingDialog() {
  const open = useWorkspaceOnboardingStore((s) => s.open);
  const step = useWorkspaceOnboardingStore((s) => s.step);
  const setStep = useWorkspaceOnboardingStore((s) => s.setStep);
  const userDisplayName = useStore((s) => s.userDisplayName);
  const setActiveRoom = useStore((s) => s.setActiveRoom);
  const memberships = useWorkspacesStore((s) => s.memberships);
  const customServers = useWorkspacesStore((s) => s.customServers);
  const createWorkspace = useWorkspacesStore((s) => s.createWorkspace);
  const joinWorkspace = useWorkspacesStore((s) => s.joinWorkspace);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);

  const joinable = useMemo(
    () => useWorkspacesStore.getState().discoverableServers(),
    [memberships, customServers],
  );

  if (!open) return null;

  const goTo = (next: WorkspaceOnboardingStep) => {
    setStep(next);
  };

  const handleJoin = async (workspaceId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      if (!joinWorkspace(workspaceId)) return;
      setActiveRoom(workspaceId);
      await finishWorkspaceSetup();
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !draftName.trim()) return;
    setBusy(true);
    try {
      const id = createWorkspace(draftName, userDisplayName);
      setDraftName("");
      setActiveRoom(id);
      await finishWorkspaceSetup();
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="workspace-onboarding" role="presentation">
      <div
        className="workspace-onboarding__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-onboarding-title"
      >
        {step === "choice" ? (
          <>
            <h1 id="workspace-onboarding-title" className="workspace-onboarding__title">
              Bienvenue sur Lyte
            </h1>
            <p className="workspace-onboarding__subtitle">
              Pour commencer, rejoignez un workspace existant ou créez le vôtre.
            </p>
            <div className="workspace-onboarding__choices">
              <button
                type="button"
                className="workspace-onboarding__choice"
                disabled={busy}
                onClick={() => goTo("join")}
              >
                <span className="workspace-onboarding__choice-icon" aria-hidden>
                  <LayoutGrid size={18} />
                </span>
                <span className="workspace-onboarding__choice-copy">
                  <span className="workspace-onboarding__choice-title">
                    Rejoindre un workspace
                  </span>
                  <span className="workspace-onboarding__choice-hint">
                    Parcourir les espaces publics disponibles.
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="workspace-onboarding__choice"
                disabled={busy}
                onClick={() => goTo("create")}
              >
                <span className="workspace-onboarding__choice-icon" aria-hidden>
                  <Plus size={18} />
                </span>
                <span className="workspace-onboarding__choice-copy">
                  <span className="workspace-onboarding__choice-title">Créer mon workspace</span>
                  <span className="workspace-onboarding__choice-hint">
                    Lancez votre propre espace d&apos;équipe.
                  </span>
                </span>
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              className="workspace-onboarding__back"
              disabled={busy}
              onClick={() => goTo("choice")}
            >
              <ArrowLeft size={14} aria-hidden />
              Retour
            </button>

            {step === "join" ? (
              <>
                <h1 id="workspace-onboarding-title" className="workspace-onboarding__title">
                  Rejoindre un workspace
                </h1>
                <p className="workspace-onboarding__subtitle">
                  Choisissez un espace public à rejoindre.
                </p>
                {joinable.length === 0 ? (
                  <p className="workspace-onboarding__empty">
                    Aucun workspace public disponible pour le moment. Créez le vôtre à la place.
                  </p>
                ) : (
                  <ul className="workspace-onboarding__list">
                    {joinable.map((workspace) => (
                      <li key={workspace.id}>
                        <button
                          type="button"
                          className="workspace-onboarding__row"
                          disabled={busy}
                          onClick={() => void handleJoin(workspace.id)}
                        >
                          <span
                            className="workspace-onboarding__row-icon"
                            style={{ backgroundColor: workspace.accent }}
                            aria-hidden
                          >
                            {workspaceInitials(workspace.name)}
                          </span>
                          <span className="workspace-onboarding__row-copy">
                            <span className="workspace-onboarding__row-name">{workspace.name}</span>
                            <span className="workspace-onboarding__row-meta">
                              Propriétaire · {workspace.ownerName}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <h1 id="workspace-onboarding-title" className="workspace-onboarding__title">
                  Créer mon workspace
                </h1>
                <p className="workspace-onboarding__subtitle">
                  Donnez un nom à votre espace. Vous pourrez inviter des collègues ensuite.
                </p>
                <form className="workspace-onboarding__create" onSubmit={(e) => void handleCreate(e)}>
                  <label className="sr-only" htmlFor="workspace-onboarding-name">
                    Nom du workspace
                  </label>
                  <input
                    id="workspace-onboarding-name"
                    type="text"
                    className="workspace-onboarding__input"
                    placeholder="Ex. Studio Lumen"
                    value={draftName}
                    disabled={busy}
                    onChange={(event) => setDraftName(event.target.value)}
                    autoFocus
                  />
                  <button
                    type="submit"
                    className={clsx("btn workspace-onboarding__submit", busy && "opacity-70")}
                    disabled={busy || !draftName.trim()}
                  >
                    {busy ? "Création…" : "Créer et continuer"}
                  </button>
                </form>
              </>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
