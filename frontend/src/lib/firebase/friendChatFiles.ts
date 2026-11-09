import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type { PeopleMessageAttachment } from "../peopleChat";
import { storage } from "./client";

export const CHAT_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const CHAT_FILE_MAX_COUNT = 8;

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  md: "text/markdown",
  json: "application/json",
  rtf: "application/rtf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
};

function extensionOf(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext.length > 0 && ext.length <= 8 ? ext : "";
}

function isAllowedContentType(contentType: string): boolean {
  return (
    contentType.startsWith("image/") ||
    contentType.startsWith("text/") ||
    contentType === "application/pdf" ||
    contentType === "application/json" ||
    contentType === "application/zip" ||
    contentType === "application/rtf" ||
    contentType === "application/msword" ||
    contentType.startsWith("application/vnd.")
  );
}

export function chatFileContentType(file: File): string | null {
  if (file.type && isAllowedContentType(file.type)) return file.type;
  return MIME_BY_EXT[extensionOf(file.name)] ?? null;
}

export function chatFileRejection(file: File): string | null {
  if (file.size <= 0) return "Le fichier est vide.";
  if (file.size > CHAT_FILE_MAX_BYTES) return `${file.name} dépasse 20 Mo.`;
  if (!chatFileContentType(file)) return `${file.name} n'est pas un format accepté.`;
  return null;
}

function safeStorageName(name: string): string {
  const base = name.split(/[/\\]/).pop()?.trim() || "fichier";
  const cleaned = base.replace(/[^\w.\- ()]/g, "_").slice(0, 120);
  return cleaned || "fichier";
}

export function peopleAttachmentPreview(
  attachments: PeopleMessageAttachment[] | undefined,
  text: string,
): string {
  const trimmed = text.trim();
  if (trimmed) return trimmed;
  if (!attachments?.length) return "";
  const first = attachments[0]!;
  if (attachments.length === 1) return first.isImage ? "Image" : first.name;
  if (attachments.every((item) => item.isImage)) return `${attachments.length} images`;
  return `${attachments.length} fichiers`;
}

export function normalizePeopleAttachments(value: unknown): PeopleMessageAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: PeopleMessageAttachment[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<PeopleMessageAttachment>;
    if (typeof item.url !== "string" || !item.url || typeof item.name !== "string" || !item.name) {
      continue;
    }
    const contentType = typeof item.contentType === "string" ? item.contentType : "";
    items.push({
      id: typeof item.id === "string" && item.id ? item.id : item.url,
      name: item.name,
      url: item.url,
      contentType,
      size: typeof item.size === "number" && Number.isFinite(item.size) ? item.size : 0,
      isImage: item.isImage === true || contentType.startsWith("image/"),
    });
  }
  return items.length > 0 ? items : undefined;
}

export async function uploadFriendChatFiles(
  chatId: string,
  authorUid: string,
  files: File[],
): Promise<PeopleMessageAttachment[]> {
  const batchId = crypto.randomUUID();
  return Promise.all(
    files.map(async (file, index) => {
      const contentType = chatFileContentType(file);
      if (!contentType) throw new Error(`${file.name} n'est pas un format accepté.`);
      const storageRef = ref(
        storage,
        `friendChats/${chatId}/${authorUid}/${batchId}/${index}-${safeStorageName(file.name)}`,
      );
      await uploadBytes(storageRef, file, { contentType });
      const url = await getDownloadURL(storageRef);
      return {
        id: `${batchId}-${index}`,
        name: file.name.slice(0, 180),
        url,
        contentType,
        size: file.size,
        isImage: contentType.startsWith("image/"),
      };
    }),
  );
}
