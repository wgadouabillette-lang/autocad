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
import { syncDevSubscriptionToFirestore } from "../lib/firebase/subscriptionSync";
import {
  loadChatSessionSummaries,
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
import {
  writeUserPreferences,
  normalizeSidePanelSide,
  resolveCalendarWorkingHours,
  type SidePanelSide,
  type UserPreferences,
} from "../lib/userPreferences";
import { applyDocumentAccentColor, normalizeAccentColorPreference } from "../lib/accentColor";
import type { AiModel } from "../lib/aiModels";
import { isValidAiModel } from "../lib/aiModels";
import { isLegacyPublicWorkspaceId } from "../lib/workspaces";
import { resolveActiveWorkspaceId } from "../lib/lastActiveWorkspace";
import { useStore, type AutosavePayload } from "./useStore";
import { useWorkspacesStore } from "./useWorkspacesStore";
import { useCallsStore } from "./useCallsStore";
import {
  applyDashboardOnboardingFromProfile,
} from "../lib/dashboardOnboarding";
import { debugLog } from "../lib/debugLog";

export type AuthProvider = FirebaseAuthProvider;

const PROFILE_SYNC_DEBOUNCE_MS = 600;
const AUTH_HYDRATE_TIMEOUT_MS = 12_000;

let activeAuthHydrateCleanup: (() => void) | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    }),
  ]);
}

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
  if (providerId === "facebook.com") return "facebook";
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
  // Stripe désactivé — on conserve le toggle local plutôt que d'écraser depuis Firestore.
  const currentState = useStore.getState();
  const subscriptionPlan = currentState.subscriptionPlan;
  const billingManaged = currentState.billingManaged;
  const onDemandUsageEnabled = currentState.onDemandUsageEnabled;
  const calendarHours = resolveCalendarWorkingHours(
    profile.calendarWorkStartMinutes ?? currentState.calendarWorkStartMinutes,
    profile.calendarWorkEndMinutes ?? currentState.calendarWorkEndMinutes,
  );
  useStore.setState({
    chatWorkMode: profile.chatWorkMode,
    autoWorkModeSwitch: profile.autoWorkModeSwitch,
    userDisplayName: profile.userDisplayName,
    userEmail: profile.userEmail,
    photoURL: profile.photoURL ?? null,
    recordingCameraPreview: profile.recordingCameraPreview,
    recordingCameraMirrorPreview: profile.recordingCameraMirrorPreview !== false,
    audioInputDeviceId: profile.audioInputDeviceId ?? "",
    audioOutputDeviceId: profile.audioOutputDeviceId ?? "",
    audioEchoCancellation: profile.audioEchoCancellation !== false,
    audioNoiseSuppression: profile.audioNoiseSuppression !== false,
    chatPanelOpen: profile.chatPanelOpen,
    sidePanelSide,
    colorTheme: profile.colorTheme === "light" || profile.colorTheme === "system" ? profile.colorTheme : "dark",
    accentColor: normalizeAccentColorPreference(profile.accentColor ?? currentState.accentColor),
    agentChatInstructions: profile.agentChatInstructions ?? "",
    agentFollowUpInstructions: profile.agentFollowUpInstructions ?? "",
    agentAiNotesInstructions: profile.agentAiNotesInstructions ?? "",
    calendarWorkStartMinutes: calendarHours.startMinutes,
    calendarWorkEndMinutes: calendarHours.endMinutes,
    aiModel: isAiModel(profile.aiModel) ? profile.aiModel : useStore.getState().aiModel,
  });
  applyDocumentAccentColor(
    normalizeAccentColorPreference(profile.accentColor ?? currentState.accentColor),
  );
  writeUserPreferences({
    chatWorkMode: profile.chatWorkMode,
    autoWorkModeSwitch: profile.autoWorkModeSwitch,
    userDisplayName: profile.userDisplayName,
    userEmail: profile.userEmail,
    photoURL: profile.photoURL,
    recordingCameraPreview: profile.recordingCameraPreview,
    recordingCameraMirrorPreview: profile.recordingCameraMirrorPreview !== false,
    audioInputDeviceId: profile.audioInputDeviceId ?? "",
    audioOutputDeviceId: profile.audioOutputDeviceId ?? "",
    audioEchoCancellation: profile.audioEchoCancellation !== false,
    audioNoiseSuppression: profile.audioNoiseSuppression !== false,
    chatPanelOpen: profile.chatPanelOpen,
    sidePanelSide,
    colorTheme: profile.colorTheme === "light" || profile.colorTheme === "system" ? profile.colorTheme : "dark",
    accentColor: normalizeAccentColorPreference(profile.accentColor ?? currentState.accentColor),
    subscriptionPlan,
    billingManaged,
    onDemandUsageEnabled,
    agentChatInstructions: profile.agentChatInstructions ?? "",
    agentFollowUpInstructions: profile.agentFollowUpInstructions ?? "",
    agentAiNotesInstructions: profile.agentAiNotesInstructions ?? "",
    calendarWorkStartMinutes: calendarHours.startMinutes,
    calendarWorkEndMinutes: calendarHours.endMinutes,
  });
  useCallsStore.getState().syncLocalParticipantProfile({
    photoURL: profile.photoURL ?? null,
    displayName: profile.userDisplayName,
  });
}

function profileFromStore(user: User): UserProfileDoc {
  const state = useStore.getState();
  // Stripe désactivé: on n'envoie plus `subscriptionPlan`/`onDemandUsageEnabled` à Firestore
  // (les rules ne laissent passer que le SDK Admin via webhook). Le toggle vit en localStorage.
  const profile: UserProfileDoc = {
    email: user.email?.trim().toLowerCase() ?? state.userEmail,
    photoURL: state.photoURL ?? user.photoURL ?? undefined,
    chatWorkMode: state.chatWorkMode,
    autoWorkModeSwitch: state.autoWorkModeSwitch,
    userDisplayName: state.userDisplayName,
    userEmail: state.userEmail,
    recordingCameraPreview: state.recordingCameraPreview,
    recordingCameraMirrorPreview: state.recordingCameraMirrorPreview,
    audioInputDeviceId: state.audioInputDeviceId,
    audioOutputDeviceId: state.audioOutputDeviceId,
    audioEchoCancellation: state.audioEchoCancellation,
    audioNoiseSuppression: state.audioNoiseSuppression,
    chatPanelOpen: state.chatPanelOpen,
    sidePanelSide: normalizeSidePanelSide(state.sidePanelSide),
    colorTheme: state.colorTheme,
    accentColor: state.accentColor,
    agentChatInstructions: state.agentChatInstructions,
    agentFollowUpInstructions: state.agentFollowUpInstructions,
    agentAiNotesInstructions: state.agentAiNotesInstructions,
    calendarWorkStartMinutes: state.calendarWorkStartMinutes,
    calendarWorkEndMinutes: state.calendarWorkEndMinutes,
  };
  return profile;
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
    recordingCameraMirrorPreview: profile.recordingCameraMirrorPreview !== false,
    chatPanelOpen: profile.chatPanelOpen,
    sidePanelSide: profile.sidePanelSide,
    colorTheme: profile.colorTheme,
    accentColor: profile.accentColor ?? null,
    agentChatInstructions: profile.agentChatInstructions ?? "",
    agentFollowUpInstructions: profile.agentFollowUpInstructions ?? "",
    agentAiNotesInstructions: profile.agentAiNotesInstructions ?? "",
    calendarWorkStartMinutes: profile.calendarWorkStartMinutes ?? null,
    calendarWorkEndMinutes: profile.calendarWorkEndMinutes ?? null,
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
      state.recordingCameraMirrorPreview === previousState.recordingCameraMirrorPreview &&
      state.chatPanelOpen === previousState.chatPanelOpen &&
      state.sidePanelSide === previousState.sidePanelSide &&
      state.colorTheme === previousState.colorTheme &&
      state.accentColor === previousState.accentColor &&
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
    loadChatSessionSummaries(uid),
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
    const target = resolveActiveWorkspaceId(
      joined.map((workspace) => workspace.id),
      { currentId: useStore.getState().activeRoomId, userId: ownerUid },
    );
    if (target) {
      useStore.getState().setActiveRoom(target);
    }
    if (joined.length === 0) {
      const id = useWorkspacesStore.getState().createPersonalWorkspace(displayName, ownerUid);
      useStore.getState().setActiveRoom(id);
      void saveUserWorkspaces(uid, {
        customServers: useWorkspacesStore.getState().customServers,
        memberships: useWorkspacesStore.getState().memberships,
      }).catch(() => {});
    }
    if (profile && !profile.workspaceSetupCompleted) {
      void saveUserAccountProfile(uid, {
        ...profileFromStore(auth.currentUser!),
        workspaceSetupCompleted: true,
      }).catch(() => {});
    }
  } else {
    useWorkspacesStore.getState().resetLocalMemberships();
    const id = useWorkspacesStore.getState().createPersonalWorkspace(displayName, ownerUid);
    useStore.getState().setActiveRoom(id);
    void saveUserWorkspaces(uid, {
      customServers: useWorkspacesStore.getState().customServers,
      memberships: useWorkspacesStore.getState().memberships,
    }).catch(() => {});
    void saveUserAccountProfile(uid, {
      ...profileFromStore(auth.currentUser!),
      workspaceSetupCompleted: true,
    }).catch(() => {});
  }

  void useWorkspacesStore.getState().reconcilePendingJoinRequests(uid);

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
    activeAuthHydrateCleanup?.();
    activeAuthHydrateCleanup = null;

    let disposed = false;
    let stopProfileAutosync: (() => void) | null = null;
    let authLoadId = 0;
    let pendingAuthResolved = false;
    let unsubscribe: (() => void) | null = null;

    const setSignedOut = (reason: string) => {
      // #region agent log
      debugLog(
        "useAuthStore.ts:setSignedOut",
        "Auth signed out",
        {
          reason,
          pathname: window.location.pathname,
          hadUid: get().firebaseUid,
        },
        "B",
      );
      // #endregion
      set({
        ready: true,
        isAuthenticated: false,
        authEmail: null,
        authProvider: null,
        firebaseUid: null,
      });
    };

    const readyFallback = window.setTimeout(() => {
      if (!disposed && !get().ready && pendingAuthResolved) {
        set({ ready: true });
      }
    }, 2500);

    const handleAuthenticatedUser = (user: User, source: string) => {
      if (disposed) return;
      // #region agent log
      debugLog(
        "useAuthStore.ts:handleAuthenticatedUser",
        "Hydrating authenticated user",
        {
          source,
          uid: user.uid,
          email: user.email ?? null,
          priorReady: get().ready,
          priorAuthenticated: get().isAuthenticated,
        },
        "E",
      );
      // #endregion
      window.clearTimeout(readyFallback);
      authLoadId += 1;
      const loadId = authLoadId;
      stopProfileAutosync?.();
      stopProfileAutosync = null;

      set({ ready: false });
      set(applyFirebaseUser(user));

      const readySafety = window.setTimeout(() => {
        if (!disposed && loadId === authLoadId && auth.currentUser?.uid === user.uid && !get().ready) {
          set({ ready: true });
          useStore.getState().openAgentPanel();
        }
      }, AUTH_HYDRATE_TIMEOUT_MS);

      void (async () => {
        try {
          const hydrated = await withTimeout(
            hydrateRemoteData(user.uid),
            AUTH_HYDRATE_TIMEOUT_MS,
            "hydrateRemoteData",
          );
          if (!hydrated || disposed || loadId !== authLoadId) return;
          void saveUserAccountProfile(user.uid, profileFromStore(user)).catch(() => {});
          if (disposed || loadId !== authLoadId || auth.currentUser?.uid !== user.uid) return;
          stopProfileAutosync = startProfileAutosync(user.uid, user, (message) => {
            set({ authError: message });
          });
        } catch (error) {
          if (disposed || loadId !== authLoadId) return;
          const message =
            error instanceof Error ? error.message : "Synchronisation cloud impossible.";
          if (!message.endsWith(" timeout")) {
            set({ authError: message });
          }
        } finally {
          window.clearTimeout(readySafety);
          if (!disposed && loadId === authLoadId && auth.currentUser?.uid === user.uid) {
            const joined = useWorkspacesStore.getState().joinedWorkspaces(user.uid);
            if (joined.length === 0) {
              const id = useWorkspacesStore.getState().createPersonalWorkspace(
                useStore.getState().userDisplayName,
                user.uid,
              );
              useStore.getState().setActiveRoom(id);
            } else {
              const target = resolveActiveWorkspaceId(
                joined.map((workspace) => workspace.id),
                { currentId: useStore.getState().activeRoomId, userId: user.uid },
              );
              if (target) useStore.getState().setActiveRoom(target);
            }
            const { subscriptionPlan, billingManaged, onDemandUsageEnabled } = useStore.getState();
            if (subscriptionPlan === "pro" && billingManaged) {
              void syncDevSubscriptionToFirestore("pro", onDemandUsageEnabled).catch(() => {});
            }
            set({ ready: true });
            useStore.getState().openAgentPanel();
          }
        }
      })();
    };

    void (async () => {
      try {
        await completeEmailLinkSignInIfPresent();
      } catch (error: unknown) {
        const message = formatAuthError(error);
        if (message && !disposed) set({ authError: message, ready: true });
      }

      let redirectUser: User | null = null;
      try {
        redirectUser = await completeOAuthRedirectIfPresent();
      } catch (error: unknown) {
        const message = formatAuthError(error);
        if (message && !disposed) set({ authError: message, ready: true });
      }

      if (disposed) return;
      pendingAuthResolved = true;

      const user = redirectUser ?? auth.currentUser;
      // #region agent log
      debugLog(
        "useAuthStore.ts:hydrateInitialUser",
        "Resolved initial auth user",
        {
          redirectUid: redirectUser?.uid ?? null,
          currentUid: auth.currentUser?.uid ?? null,
          chosenUid: user?.uid ?? null,
          pathname: window.location.pathname,
          search: window.location.search,
        },
        "A",
      );
      // #endregion
      if (user) {
        handleAuthenticatedUser(user, "hydrate-initial");
      } else {
        setSignedOut("hydrate-no-user");
      }

      unsubscribe = watchAuthState((nextUser) => {
        if (disposed) return;
        // #region agent log
        debugLog(
          "useAuthStore.ts:watchAuthState",
          "Auth state changed",
          {
            nextUid: nextUser?.uid ?? null,
            currentUid: get().firebaseUid,
            ready: get().ready,
            isAuthenticated: get().isAuthenticated,
          },
          "B",
        );
        // #endregion
        if (!nextUser) {
          void (async () => {
            await auth.authStateReady();
            if (disposed) return;
            if (auth.currentUser) {
              // #region agent log
              debugLog(
                "useAuthStore.ts:watchAuthState",
                "Ignored spurious auth null",
                { uid: auth.currentUser.uid },
                "B",
              );
              // #endregion
              return;
            }
            setSignedOut("watchAuthState-null");
          })();
          return;
        }
        if (nextUser.uid === get().firebaseUid && get().isAuthenticated) {
          return;
        }
        handleAuthenticatedUser(nextUser, "watchAuthState");
      });
    })();

    const cleanup = () => {
      disposed = true;
      window.clearTimeout(readyFallback);
      stopProfileAutosync?.();
      unsubscribe?.();
      if (activeAuthHydrateCleanup === cleanup) {
        activeAuthHydrateCleanup = null;
      }
    };
    activeAuthHydrateCleanup = cleanup;
    return cleanup;
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
    // #region agent log
    debugLog(
      "useAuthStore.ts:signInWithProvider",
      "OAuth sign-in started",
      { provider, pathname: window.location.pathname },
      "E",
    );
    // #endregion
    set({ authError: null, ready: false });
    try {
      const user = await signInWithOAuthProvider(provider);
      // #region agent log
      debugLog(
        "useAuthStore.ts:signInWithProvider",
        "OAuth sign-in completed via popup",
        { provider, uid: user.uid, email: user.email ?? null },
        "E",
      );
      // #endregion
    } catch (error) {
      if (error instanceof OAuthRedirectStartedError) {
        // #region agent log
        debugLog(
          "useAuthStore.ts:signInWithProvider",
          "OAuth redirect started",
          { provider },
          "A",
        );
        // #endregion
        return;
      }
      // #region agent log
      debugLog(
        "useAuthStore.ts:signInWithProvider",
        "OAuth sign-in failed",
        {
          provider,
          authDomain: auth.app.options.authDomain ?? null,
          message: error instanceof Error ? error.message : String(error),
        },
        "E",
      );
      // #endregion
      set({ authError: formatAuthError(error, provider), ready: true });
    }
  },

  signOut: async () => {
    await signOutUser();
    useStore.getState().setPhotoURL(null);
    useStore.setState({
      subscriptionPlan: "free",
      onDemandUsageEnabled: false,
      billingManaged: false,
    });
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
    recordingCameraMirrorPreview: state.recordingCameraMirrorPreview,
    audioInputDeviceId: state.audioInputDeviceId,
    audioOutputDeviceId: state.audioOutputDeviceId,
    audioEchoCancellation: state.audioEchoCancellation,
    audioNoiseSuppression: state.audioNoiseSuppression,
    chatPanelOpen: state.chatPanelOpen,
    sidePanelSide: normalizeSidePanelSide(state.sidePanelSide),
    colorTheme: state.colorTheme,
    accentColor: state.accentColor,
    subscriptionPlan: state.subscriptionPlan,
    billingManaged: state.billingManaged,
    onDemandUsageEnabled: state.onDemandUsageEnabled,
    agentChatInstructions: state.agentChatInstructions,
    agentFollowUpInstructions: state.agentFollowUpInstructions,
    agentAiNotesInstructions: state.agentAiNotesInstructions,
    calendarWorkStartMinutes: state.calendarWorkStartMinutes,
    calendarWorkEndMinutes: state.calendarWorkEndMinutes,
  };
}
