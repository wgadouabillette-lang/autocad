import { create } from "zustand";
import type { User } from "firebase/auth";
import {
  auth,
  completeEmailLinkSignInIfPresent,
  completeOAuthRedirectIfPresent,
  OAuthRedirectStartedError,
  sendEmailSignInLink,
  signInWithOAuthProvider,
  signOutUser,
  watchAuthState,
  type FirebaseAuthProvider,
} from "../lib/firebase/client";
import { formatAuthError } from "../lib/firebase/authErrors";
import {
  loadChatSessions,
  loadLatestProjectSnapshot,
  loadUserProfile,
  loadUserWorkspaces,
  saveUserDirectoryProfile,
  saveUserProfile,
  saveUserWorkspaces,
  type UserProfileDoc,
} from "../lib/firebase/userData";
import { removeProfilePhoto, uploadProfilePhoto } from "../lib/firebase/profilePhoto";
import { pushProfileToJoinedWorkspaces } from "../lib/firebase/workspacePresence";
import { writeUserPreferences, normalizeSidePanelSide, type SidePanelSide, type UserPreferences } from "../lib/userPreferences";
import type { AiModel } from "../lib/aiModels";
import { isValidAiModel } from "../lib/aiModels";
import { normalizeWorkspaceId, isLegacyPublicWorkspaceId } from "../lib/workspaces";
import { useStore, type AutosavePayload } from "./useStore";
import { useWorkspacesStore } from "./useWorkspacesStore";
import { useCallsStore } from "./useCallsStore";
import {
  applyDashboardOnboardingFromProfile,
} from "../lib/dashboardOnboarding";

export type AuthProvider = FirebaseAuthProvider;

const PROFILE_SYNC_DEBOUNCE_MS = 600;

interface AuthState {
  ready: boolean;
  isAuthenticated: boolean;
  authEmail: string | null;
  authProvider: AuthProvider | null;
  firebaseUid: string | null;
  authError: string | null;
  emailLinkSent: boolean;
  hydrate: () => () => void;
  continueWithEmail: (email: string) => Promise<void>;
  signInWithProvider: (provider: AuthProvider) => Promise<void>;
  signOut: () => Promise<void>;
  syncProfileToCloud: () => Promise<void>;
  syncWorkspacesToCloud: () => Promise<void>;
  markWorkspaceSetupCompleted: () => Promise<void>;
  markDashboardOnboardingCompleted: () => Promise<void>;
  uploadAndSyncProfilePhoto: (file: File) => Promise<void>;
  removeAndSyncProfilePhoto: () => Promise<void>;
}

function displayNameFromUser(user: User): string {
  if (user.displayName?.trim()) return user.displayName.trim();
  const local = user.email?.split("@")[0]?.trim();
  if (!local) return "Utilisateur";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function providerFromUser(user: User): AuthProvider | null {
  const providerId = user.providerData[0]?.providerId;
  if (providerId === "google.com") return "google";
  if (providerId === "microsoft.com") return "microsoft";
  if (providerId === "apple.com") return "apple";
  return null;
}

function applyFirebaseUser(user: User) {
  const email = user.email?.trim().toLowerCase() ?? "";
  useStore.getState().setUserEmail(email || useStore.getState().userEmail);
  useStore.getState().setUserDisplayName(displayNameFromUser(user));
  useStore.getState().setPhotoURL(user.photoURL ?? null);
  return {
    isAuthenticated: true,
    authEmail: email || null,
    authProvider: providerFromUser(user),
    firebaseUid: user.uid,
    authError: null,
    emailLinkSent: false,
  };
}

function isAiModel(value: unknown): value is AiModel {
  return isValidAiModel(value);
}

function resolveProfileSidePanelSide(profile: UserProfileDoc): SidePanelSide {
  if (profile.sidePanelSide === "left" || profile.sidePanelSide === "right") {
    return profile.sidePanelSide;
  }
  return normalizeSidePanelSide(useStore.getState().sidePanelSide);
}

function applyLocalProfile(profile: UserProfileDoc) {
  const sidePanelSide = resolveProfileSidePanelSide(profile);
  useStore.setState({
    chatWorkMode: profile.chatWorkMode,
    autoWorkModeSwitch: profile.autoWorkModeSwitch,
    userDisplayName: profile.userDisplayName,
    userEmail: profile.userEmail,
    photoURL: profile.photoURL ?? null,
    recordingCameraPreview: profile.recordingCameraPreview,
    audioInputDeviceId: profile.audioInputDeviceId ?? "",
    audioOutputDeviceId: profile.audioOutputDeviceId ?? "",
    audioEchoCancellation: profile.audioEchoCancellation !== false,
    audioNoiseSuppression: profile.audioNoiseSuppression !== false,
    chatPanelOpen: profile.chatPanelOpen,
    sidePanelSide,
    subscriptionPlan: profile.subscriptionPlan,
    onDemandUsageEnabled: profile.onDemandUsageEnabled,
    agentChatInstructions: profile.agentChatInstructions ?? "",
    agentFollowUpInstructions: profile.agentFollowUpInstructions ?? "",
    agentAiNotesInstructions: profile.agentAiNotesInstructions ?? "",
    aiModel: isAiModel(profile.aiModel) ? profile.aiModel : useStore.getState().aiModel,
  });
  writeUserPreferences({
    chatWorkMode: profile.chatWorkMode,
    autoWorkModeSwitch: profile.autoWorkModeSwitch,
    userDisplayName: profile.userDisplayName,
    userEmail: profile.userEmail,
    photoURL: profile.photoURL,
    recordingCameraPreview: profile.recordingCameraPreview,
    audioInputDeviceId: profile.audioInputDeviceId ?? "",
    audioOutputDeviceId: profile.audioOutputDeviceId ?? "",
    audioEchoCancellation: profile.audioEchoCancellation !== false,
    audioNoiseSuppression: profile.audioNoiseSuppression !== false,
    chatPanelOpen: profile.chatPanelOpen,
    sidePanelSide,
    subscriptionPlan: profile.subscriptionPlan,
    onDemandUsageEnabled: profile.onDemandUsageEnabled,
    agentChatInstructions: profile.agentChatInstructions ?? "",
    agentFollowUpInstructions: profile.agentFollowUpInstructions ?? "",
    agentAiNotesInstructions: profile.agentAiNotesInstructions ?? "",
  });
  useCallsStore.getState().syncLocalParticipantProfile({
    photoURL: profile.photoURL ?? null,
    displayName: profile.userDisplayName,
  });
}

function profileFromStore(user: User): UserProfileDoc {
  const state = useStore.getState();
  return {
    email: user.email?.trim().toLowerCase() ?? state.userEmail,
    photoURL: state.photoURL ?? user.photoURL ?? undefined,
    chatWorkMode: state.chatWorkMode,
    autoWorkModeSwitch: state.autoWorkModeSwitch,
    userDisplayName: state.userDisplayName,
    userEmail: state.userEmail,
    recordingCameraPreview: state.recordingCameraPreview,
    audioInputDeviceId: state.audioInputDeviceId,
    audioOutputDeviceId: state.audioOutputDeviceId,
    audioEchoCancellation: state.audioEchoCancellation,
    audioNoiseSuppression: state.audioNoiseSuppression,
    chatPanelOpen: state.chatPanelOpen,
    sidePanelSide: normalizeSidePanelSide(state.sidePanelSide),
    subscriptionPlan: state.subscriptionPlan,
    onDemandUsageEnabled: state.onDemandUsageEnabled,
    agentChatInstructions: state.agentChatInstructions,
    agentFollowUpInstructions: state.agentFollowUpInstructions,
    agentAiNotesInstructions: state.agentAiNotesInstructions,
  };
}

async function saveUserAccountProfile(uid: string, profile: UserProfileDoc): Promise<void> {
  await Promise.all([
    saveUserProfile(uid, profile),
    saveUserDirectoryProfile(uid, profile),
  ]);
}

function profileSyncKey(profile: UserProfileDoc): string {
  return JSON.stringify({
    photoURL: profile.photoURL ?? null,
    workspaceSetupCompleted: profile.workspaceSetupCompleted === true,
    dashboardOnboardingCompleted: profile.dashboardOnboardingCompleted === true,
    chatWorkMode: profile.chatWorkMode,
    autoWorkModeSwitch: profile.autoWorkModeSwitch,
    userDisplayName: profile.userDisplayName,
    userEmail: profile.userEmail,
    recordingCameraPreview: profile.recordingCameraPreview,
    chatPanelOpen: profile.chatPanelOpen,
    sidePanelSide: profile.sidePanelSide,
    subscriptionPlan: profile.subscriptionPlan,
    onDemandUsageEnabled: profile.onDemandUsageEnabled,
    agentChatInstructions: profile.agentChatInstructions ?? "",
    agentFollowUpInstructions: profile.agentFollowUpInstructions ?? "",
    agentAiNotesInstructions: profile.agentAiNotesInstructions ?? "",
    aiModel: profile.aiModel ?? null,
  });
}

function startProfileAutosync(
  uid: string,
  user: User,
  onError: (message: string) => void,
): () => void {
  let disposed = false;
  let syncTimer: number | null = null;
  let lastSyncedKey = profileSyncKey(profileFromStore(user));

  const flush = async () => {
    if (disposed) return;
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== uid) return;

    const profile = profileFromStore(currentUser);
    const nextKey = profileSyncKey(profile);
    if (nextKey === lastSyncedKey) return;

    try {
      await saveUserAccountProfile(uid, profile);
      lastSyncedKey = nextKey;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Synchronisation des paramètres impossible.";
      onError(message);
    }
  };

  const unsubscribe = useStore.subscribe((state, previousState) => {
    if (disposed) return;
    if (
      state.chatWorkMode === previousState.chatWorkMode &&
      state.autoWorkModeSwitch === previousState.autoWorkModeSwitch &&
      state.userDisplayName === previousState.userDisplayName &&
      state.userEmail === previousState.userEmail &&
      state.photoURL === previousState.photoURL &&
      state.recordingCameraPreview === previousState.recordingCameraPreview &&
      state.chatPanelOpen === previousState.chatPanelOpen &&
      state.sidePanelSide === previousState.sidePanelSide &&
      state.subscriptionPlan === previousState.subscriptionPlan &&
      state.onDemandUsageEnabled === previousState.onDemandUsageEnabled &&
      state.aiModel === previousState.aiModel
    ) {
      return;
    }

    if (syncTimer !== null) {
      window.clearTimeout(syncTimer);
    }
    syncTimer = window.setTimeout(() => {
      syncTimer = null;
      void flush();
    }, PROFILE_SYNC_DEBOUNCE_MS);
  });

  return () => {
    disposed = true;
    if (syncTimer !== null) {
      window.clearTimeout(syncTimer);
    }
    unsubscribe();
  };
}

async function hydrateRemoteData(uid: string): Promise<boolean> {
  const [profile, workspaces, chatSessions, project] = await Promise.all([
    loadUserProfile(uid),
    loadUserWorkspaces(uid),
    loadChatSessions(uid),
    loadLatestProjectSnapshot(uid),
  ]);

  if (auth.currentUser?.uid !== uid) {
    return false;
  }

  if (profile) {
    applyLocalProfile(profile);
    applyDashboardOnboardingFromProfile(
      profile.email || auth.currentUser?.email || useStore.getState().userEmail,
      profile.dashboardOnboardingCompleted,
    );
  }

  const hasCloudWorkspaces =
    workspaces.customServers.length > 0 || workspaces.memberships.length > 0;

  useWorkspacesStore.getState().stripLegacyPublicWorkspaces();

  const ownerUid = uid;
  const displayName = useStore.getState().userDisplayName;

  if (hasCloudWorkspaces) {
    const sanitizedServers = workspaces.customServers.filter(
      (server) => !isLegacyPublicWorkspaceId(server.id),
    );
    const sanitizedMemberships = workspaces.memberships.filter(
      (entry) => !isLegacyPublicWorkspaceId(entry.workspaceId),
    );
    useWorkspacesStore.setState({
      customServers: sanitizedServers,
      memberships: sanitizedMemberships,
      hydrated: true,
    });
    const joined = useWorkspacesStore.getState().joinedWorkspaces(ownerUid);
    for (const workspace of joined) {
      useCallsStore.getState().ensureRoom(workspace.id);
    }
    const active = normalizeWorkspaceId(useStore.getState().activeRoomId);
    const hasAccess = joined.some((server) => server.id === active);
    if (!hasAccess && joined.length > 0) {
      useStore.getState().setActiveRoom(joined[0].id);
    }
    if (joined.length === 0) {
      const id = useWorkspacesStore.getState().createPersonalWorkspace(displayName, ownerUid);
      useStore.getState().setActiveRoom(id);
      await saveUserWorkspaces(uid, {
        customServers: useWorkspacesStore.getState().customServers,
        memberships: useWorkspacesStore.getState().memberships,
      });
    }
    if (profile && !profile.workspaceSetupCompleted) {
      await saveUserAccountProfile(uid, {
        ...profileFromStore(auth.currentUser!),
        workspaceSetupCompleted: true,
      });
    }
  } else {
    useWorkspacesStore.getState().resetLocalMemberships();
    const id = useWorkspacesStore.getState().createPersonalWorkspace(displayName, ownerUid);
    useStore.getState().setActiveRoom(id);
    await saveUserWorkspaces(uid, {
      customServers: useWorkspacesStore.getState().customServers,
      memberships: useWorkspacesStore.getState().memberships,
    });
    await saveUserAccountProfile(uid, {
      ...(profile ?? profileFromStore(auth.currentUser!)),
      workspaceSetupCompleted: true,
    });
  }

  await useWorkspacesStore.getState().reconcilePendingJoinRequests(uid);

  if (chatSessions.length) {
    useStore.setState({ chatSessions });
  }

  if (project && typeof project === "object" && "document" in project) {
    useStore.setState({
      pendingAutosave: {
        ...(project as unknown as AutosavePayload),
        savedAt: Date.now(),
      },
    });
  }

  return true;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ready: false,
  isAuthenticated: false,
  authEmail: null,
  authProvider: null,
  firebaseUid: null,
  authError: null,
  emailLinkSent: false,

  hydrate: () => {
    let disposed = false;
    let stopProfileAutosync: (() => void) | null = null;
    let authLoadId = 0;
    const readyFallback = window.setTimeout(() => {
      if (!disposed && !get().ready) {
        set({ ready: true });
      }
    }, 2500);

    void completeEmailLinkSignInIfPresent()
      .catch((error: unknown) => {
        const message = formatAuthError(error);
        if (message) set({ authError: message, ready: true });
      });

    void completeOAuthRedirectIfPresent()
      .then((user) => {
        if (user) set(applyFirebaseUser(user));
      })
      .catch((error: unknown) => {
        const message = formatAuthError(error);
        if (message) set({ authError: message, ready: true });
      });

    const unsubscribe = watchAuthState((user) => {
      if (disposed) return;
      window.clearTimeout(readyFallback);
      authLoadId += 1;
      const loadId = authLoadId;
      stopProfileAutosync?.();
      stopProfileAutosync = null;

      if (!user) {
        set({
          ready: true,
          isAuthenticated: false,
          authEmail: null,
          authProvider: null,
          firebaseUid: null,
        });
        return;
      }

      set({ ready: false });
      set(applyFirebaseUser(user));

      void (async () => {
        try {
          const hydrated = await hydrateRemoteData(user.uid);
          if (!hydrated || disposed || loadId !== authLoadId) return;
          await saveUserAccountProfile(user.uid, profileFromStore(user));
          if (disposed || loadId !== authLoadId || auth.currentUser?.uid !== user.uid) return;
          stopProfileAutosync = startProfileAutosync(user.uid, user, (message) => {
            set({ authError: message });
          });
        } catch (error) {
          if (disposed || loadId !== authLoadId) return;
          const message =
            error instanceof Error ? error.message : "Synchronisation cloud impossible.";
          set({ authError: message });
        } finally {
          if (!disposed && loadId === authLoadId && auth.currentUser?.uid === user.uid) {
            set({ ready: true });
            useStore.getState().openAgentPanel();
          }
        }
      })();
    });

    return () => {
      disposed = true;
      window.clearTimeout(readyFallback);
      stopProfileAutosync?.();
      unsubscribe();
    };
  },

  continueWithEmail: async (email) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    set({ authError: null });
    try {
      await sendEmailSignInLink(trimmed);
      set({ emailLinkSent: true, authEmail: trimmed });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Envoi du lien impossible.";
      set({ authError: message });
    }
  },

  signInWithProvider: async (provider) => {
    set({ authError: null });
    try {
      const user = await signInWithOAuthProvider(provider);
      set(applyFirebaseUser(user));
    } catch (error) {
      if (error instanceof OAuthRedirectStartedError) return;
      set({ authError: formatAuthError(error) });
    }
  },

  signOut: async () => {
    await signOutUser();
    useStore.getState().setPhotoURL(null);
    set({
      isAuthenticated: false,
      authEmail: null,
      authProvider: null,
      firebaseUid: null,
      emailLinkSent: false,
    });
  },

  syncProfileToCloud: async () => {
    const uid = get().firebaseUid;
    const user = auth.currentUser;
    if (!uid || !user) return;
    await saveUserAccountProfile(uid, profileFromStore(user));
  },

  syncWorkspacesToCloud: async () => {
    const uid = get().firebaseUid;
    if (!uid) return;
    const { customServers, memberships } = useWorkspacesStore.getState();
    await saveUserWorkspaces(uid, { customServers, memberships });
  },

  markWorkspaceSetupCompleted: async () => {
    const uid = get().firebaseUid;
    const user = auth.currentUser;
    if (!uid || !user) return;
    await saveUserAccountProfile(uid, {
      ...profileFromStore(user),
      workspaceSetupCompleted: true,
    });
  },

  markDashboardOnboardingCompleted: async () => {
    const uid = get().firebaseUid;
    const user = auth.currentUser;
    if (!uid || !user) return;
    await saveUserAccountProfile(uid, {
      ...profileFromStore(user),
      dashboardOnboardingCompleted: true,
    });
  },

  uploadAndSyncProfilePhoto: async (file) => {
    const uid = get().firebaseUid;
    const user = auth.currentUser;
    if (!uid || !user) {
      throw new Error("Connectez-vous pour enregistrer une photo de profil.");
    }
    const url = await uploadProfilePhoto(uid, file);
    useStore.getState().setPhotoURL(url);
    useCallsStore.getState().syncLocalParticipantProfile({ photoURL: url });
    await pushProfileToJoinedWorkspaces(uid, {
      displayName: useStore.getState().userDisplayName,
      photoURL: url,
    });
    await saveUserAccountProfile(uid, profileFromStore(user));
  },

  removeAndSyncProfilePhoto: async () => {
    const uid = get().firebaseUid;
    const user = auth.currentUser;
    if (!uid || !user) {
      throw new Error("Connectez-vous pour modifier votre photo de profil.");
    }
    await removeProfilePhoto(uid);
    useStore.getState().setPhotoURL(null);
    useCallsStore.getState().syncLocalParticipantProfile({ photoURL: null });
    await pushProfileToJoinedWorkspaces(uid, {
      displayName: useStore.getState().userDisplayName,
      photoURL: null,
    });
    await saveUserAccountProfile(uid, profileFromStore(user));
  },
}));

export function currentUserPreferencesSnapshot(): UserPreferences {
  const state = useStore.getState();
  return {
    chatWorkMode: state.chatWorkMode,
    autoWorkModeSwitch: state.autoWorkModeSwitch,
    userDisplayName: state.userDisplayName,
    userEmail: state.userEmail,
    photoURL: state.photoURL ?? undefined,
    recordingCameraPreview: state.recordingCameraPreview,
    audioInputDeviceId: state.audioInputDeviceId,
    audioOutputDeviceId: state.audioOutputDeviceId,
    audioEchoCancellation: state.audioEchoCancellation,
    audioNoiseSuppression: state.audioNoiseSuppression,
    chatPanelOpen: state.chatPanelOpen,
    sidePanelSide: normalizeSidePanelSide(state.sidePanelSide),
    subscriptionPlan: state.subscriptionPlan,
    onDemandUsageEnabled: state.onDemandUsageEnabled,
    agentChatInstructions: state.agentChatInstructions,
    agentFollowUpInstructions: state.agentFollowUpInstructions,
    agentAiNotesInstructions: state.agentAiNotesInstructions,
  };
}
