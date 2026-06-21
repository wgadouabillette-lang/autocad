import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./client";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;
const ICON_EXTENSIONS = ["jpg", "png", "webp"] as const;

function workspaceIconRef(workspaceId: string, ext: string) {
  return ref(storage, `workspaces/${workspaceId}/icon.${ext}`);
}

function extFromMime(mime: string): (typeof ICON_EXTENSIONS)[number] {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

async function deleteOtherWorkspaceIcons(workspaceId: string, keepExt: string) {
  await Promise.all(
    ICON_EXTENSIONS.filter((ext) => ext !== keepExt).map(async (ext) => {
      try {
        await deleteObject(workspaceIconRef(workspaceId, ext));
      } catch {
        // Aucune icône avec cette extension.
      }
    }),
  );
}

export async function uploadWorkspaceIcon(workspaceId: string, file: File): Promise<string> {
  const trimmedId = workspaceId.trim().toLowerCase();
  if (!trimmedId) {
    throw new Error("Workspace invalide.");
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Format non supporté. Utilisez JPEG, PNG ou WebP.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Image trop volumineuse (max. 5 Mo).");
  }

  const ext = extFromMime(file.type);
  await deleteOtherWorkspaceIcons(trimmedId, ext);
  await uploadBytes(workspaceIconRef(trimmedId, ext), file, { contentType: file.type });
  return getDownloadURL(workspaceIconRef(trimmedId, ext));
}

export async function removeWorkspaceIcon(workspaceId: string): Promise<void> {
  const trimmedId = workspaceId.trim().toLowerCase();
  if (!trimmedId) return;

  await Promise.all(
    ICON_EXTENSIONS.map(async (ext) => {
      try {
        await deleteObject(workspaceIconRef(trimmedId, ext));
      } catch {
        // Rien à supprimer.
      }
    }),
  );
}
