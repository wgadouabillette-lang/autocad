import { updateProfile } from "firebase/auth";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, storage } from "./client";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;
const PROFILE_EXTENSIONS = ["jpg", "png", "webp"] as const;

function profilePhotoRef(uid: string, ext: string) {
  return ref(storage, `users/${uid}/profile/avatar.${ext}`);
}

function extFromMime(mime: string): (typeof PROFILE_EXTENSIONS)[number] {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

async function deleteOtherProfilePhotos(uid: string, keepExt: string) {
  await Promise.all(
    PROFILE_EXTENSIONS.filter((ext) => ext !== keepExt).map(async (ext) => {
      try {
        await deleteObject(profilePhotoRef(uid, ext));
      } catch {
        // Aucune photo avec cette extension.
      }
    }),
  );
}

export async function uploadProfilePhoto(uid: string, file: File): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Format non supporté. Utilisez JPEG, PNG ou WebP.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Image trop volumineuse (max. 5 Mo).");
  }

  const ext = extFromMime(file.type);
  await deleteOtherProfilePhotos(uid, ext);
  await uploadBytes(profilePhotoRef(uid, ext), file, { contentType: file.type });
  const url = await getDownloadURL(profilePhotoRef(uid, ext));

  const user = auth.currentUser;
  if (user) {
    await updateProfile(user, { photoURL: url });
  }

  return url;
}

export async function removeProfilePhoto(uid: string): Promise<void> {
  await Promise.all(
    PROFILE_EXTENSIONS.map(async (ext) => {
      try {
        await deleteObject(profilePhotoRef(uid, ext));
      } catch {
        // Rien à supprimer.
      }
    }),
  );

  const user = auth.currentUser;
  if (user) {
    await updateProfile(user, { photoURL: null });
  }
}
