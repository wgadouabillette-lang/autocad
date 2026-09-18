import { create } from "zustand";
import {
  getCameraBackgroundProcessor,
  type CameraBackgroundMode,
} from "../lib/cameraBackgroundProcessor";
import {
  addCameraBackgroundImage,
  loadCameraBackgroundGallery,
  setSelectedCameraBackgroundImage,
} from "../lib/cameraBackgroundStorage";
import {
  applyCameraBackgroundSettings,
  getLocalMediaStream,
  refreshCameraBackgroundOutput,
} from "../lib/localMedia";
import { hasCameraBackgroundAccess } from "../lib/subscriptionPlans";
import { useCallsStore } from "./useCallsStore";
import { useStore } from "./useStore";

const MODE_KEY = "meetra.cameraBackgroundMode";
const SELECTED_KEY = "meetra.cameraBackgroundSelectedId";

export type CameraBackgroundImageItem = {
  id: string;
  url: string;
};

function readStoredMode(): CameraBackgroundMode {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    if (raw === "blur" || raw === "image" || raw === "none") return raw;
  } catch {
    /* ignore */
  }
  return "none";
}

function writeStoredMode(mode: CameraBackgroundMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function writeSelectedId(id: string | null): void {
  try {
    if (id) localStorage.setItem(SELECTED_KEY, id);
    else localStorage.removeItem(SELECTED_KEY);
  } catch {
    /* ignore */
  }
}

function pushLocalStreamToCalls(): void {
  useCallsStore.setState({ localStream: getLocalMediaStream() });
}

function canUseCustomCameraBackgrounds(): boolean {
  const { subscriptionPlan, billingManaged, workspaceEnterpriseActive } = useStore.getState();
  return hasCameraBackgroundAccess(
    subscriptionPlan,
    billingManaged,
    workspaceEnterpriseActive,
  );
}

function requestCameraBackgroundUpgrade(): void {
  useStore.getState().openSettingsTab("usage");
}

type CameraBackgroundState = {
  mode: CameraBackgroundMode;
  images: CameraBackgroundImageItem[];
  selectedImageId: string | null;
  ready: boolean;
  busy: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  setMode: (mode: CameraBackgroundMode) => Promise<void>;
  selectImage: (id: string) => Promise<void>;
  addImageFromFile: (file: File) => Promise<void>;
};

let hydrated = false;

async function applySelectedBlob(
  images: CameraBackgroundImageItem[],
  selectedImageId: string | null,
  blobsById: Map<string, Blob>,
): Promise<void> {
  const id = selectedImageId ?? images[images.length - 1]?.id ?? null;
  if (!id) {
    await getCameraBackgroundProcessor().setBackgroundImage(null);
    return;
  }
  const blob = blobsById.get(id);
  if (blob) {
    await getCameraBackgroundProcessor().setBackgroundImage(blob);
  }
}

export const useCameraBackgroundStore = create<CameraBackgroundState>((set, get) => ({
  mode: readStoredMode(),
  images: [],
  selectedImageId: null,
  ready: false,
  busy: false,
  error: null,

  hydrate: async () => {
    if (hydrated) {
      set({ ready: true });
      return;
    }
    hydrated = true;
    const mode = readStoredMode();
    let images: CameraBackgroundImageItem[] = [];
    let selectedImageId: string | null = null;
    const blobsById = new Map<string, Blob>();
    try {
      const gallery = await loadCameraBackgroundGallery();
      images = gallery.images.map((entry) => {
        blobsById.set(entry.id, entry.blob);
        return { id: entry.id, url: URL.createObjectURL(entry.blob) };
      });
      selectedImageId = gallery.selectedId;
      writeSelectedId(selectedImageId);
      await applySelectedBlob(images, selectedImageId, blobsById);
    } catch (error) {
      console.warn("[cameraBackground] hydrate gallery failed", error);
    }
    await applyCameraBackgroundSettings(mode === "none" || canUseCustomCameraBackgrounds() ? mode : "none");
    set({
      mode: mode === "none" || canUseCustomCameraBackgrounds() ? mode : "none",
      images,
      selectedImageId,
      ready: true,
      error: null,
    });
  },

  setMode: async (mode) => {
    if (mode !== "none" && !canUseCustomCameraBackgrounds()) {
      requestCameraBackgroundUpgrade();
      return;
    }
    writeStoredMode(mode);
    set({ mode, error: null, busy: true });

    const calls = useCallsStore.getState();
    if (mode !== "none" && !calls.cameraOn) {
      await calls.toggleCamera();
      if (!useCallsStore.getState().cameraOn) {
        set({
          busy: false,
          error: "Impossible d'activer la caméra pour le fond.",
          mode: "none",
        });
        writeStoredMode("none");
        return;
      }
    }

    if (mode === "image" && !get().images.length) {
      set({ busy: false, error: "Ajoutez une image d’abord." });
      writeStoredMode("none");
      set({ mode: "none" });
      return;
    }

    if (mode === "image") {
      try {
        const gallery = await loadCameraBackgroundGallery();
        const blobsById = new Map(gallery.images.map((img) => [img.id, img.blob] as const));
        await applySelectedBlob(get().images, get().selectedImageId, blobsById);
      } catch {
        /* processor may already have image */
      }
    }

    try {
      await applyCameraBackgroundSettings(mode);
      await refreshCameraBackgroundOutput();
      pushLocalStreamToCalls();
      set({ busy: false, error: null });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Fonds caméra indisponibles.";
      writeStoredMode("none");
      await applyCameraBackgroundSettings("none").catch(() => undefined);
      await refreshCameraBackgroundOutput().catch(() => undefined);
      pushLocalStreamToCalls();
      set({ busy: false, error: message, mode: "none" });
    }
  },

  selectImage: async (id) => {
    if (!canUseCustomCameraBackgrounds()) {
      requestCameraBackgroundUpgrade();
      return;
    }
    const { images } = get();
    if (!images.some((img) => img.id === id)) return;
    writeSelectedId(id);
    set({ selectedImageId: id, busy: true, error: null });
    try {
      await setSelectedCameraBackgroundImage(id);
      const gallery = await loadCameraBackgroundGallery();
      const blobsById = new Map(gallery.images.map((img) => [img.id, img.blob] as const));
      await applySelectedBlob(images, id, blobsById);
      await get().setMode("image");
    } catch (error) {
      set({
        busy: false,
        error:
          error instanceof Error && error.message
            ? error.message
            : "Impossible d'appliquer l'image.",
      });
    }
  },

  addImageFromFile: async (file) => {
    if (!canUseCustomCameraBackgrounds()) {
      requestCameraBackgroundUpgrade();
      return;
    }
    if (!file.type.startsWith("image/")) {
      set({ error: "Choisissez un fichier image." });
      return;
    }
    set({ busy: true, error: null });
    try {
      const { images: stored, selectedId, removedId } = await addCameraBackgroundImage(file);
      const prev = get().images;
      if (removedId) {
        const doomed = prev.find((img) => img.id === removedId);
        if (doomed) URL.revokeObjectURL(doomed.url);
      }
      // Rebuild URLs for current queue (keep existing URLs when possible)
      const urlById = new Map(prev.map((img) => [img.id, img.url] as const));
      const images: CameraBackgroundImageItem[] = stored.map((entry) => {
        const existing = urlById.get(entry.id);
        if (existing) return { id: entry.id, url: existing };
        return { id: entry.id, url: URL.createObjectURL(entry.blob) };
      });
      // Revoke URLs no longer in queue
      for (const item of prev) {
        if (!images.some((img) => img.id === item.id)) {
          URL.revokeObjectURL(item.url);
        }
      }

      writeSelectedId(selectedId);
      set({ images, selectedImageId: selectedId });
      await getCameraBackgroundProcessor().setBackgroundImage(file);
      await get().setMode("image");
    } catch (error) {
      set({
        busy: false,
        error:
          error instanceof Error && error.message
            ? error.message
            : "Impossible d'appliquer l'image.",
      });
    }
  },
}));
