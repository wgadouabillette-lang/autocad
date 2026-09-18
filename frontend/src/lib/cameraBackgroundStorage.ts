/** Persist up to 3 camera background images (FIFO) in IndexedDB. */

export const CAMERA_BG_IMAGE_MAX = 3;

const DB_NAME = "meetra-camera-background";
const STORE = "images";
const GALLERY_KEY = "gallery-v2";
const LEGACY_KEY = "custom";
const DB_VERSION = 2;

export type CameraBackgroundStoredImage = {
  id: string;
  blob: Blob;
};

type GalleryRecord = {
  /** Oldest → newest */
  items: CameraBackgroundStoredImage[];
  selectedId: string | null;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function reqResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

async function readGallery(store: IDBObjectStore): Promise<GalleryRecord> {
  const raw = await reqResult(store.get(GALLERY_KEY));
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as GalleryRecord).items)
  ) {
    const record = raw as GalleryRecord;
    const items = record.items.filter(
      (item) => item && typeof item.id === "string" && item.blob instanceof Blob,
    );
    const selectedId =
      record.selectedId && items.some((item) => item.id === record.selectedId)
        ? record.selectedId
        : items[items.length - 1]?.id ?? null;
    return { items, selectedId };
  }

  const legacy = await reqResult(store.get(LEGACY_KEY));
  if (legacy instanceof Blob) {
    const id = `img_${Date.now()}`;
    return { items: [{ id, blob: legacy }], selectedId: id };
  }

  return { items: [], selectedId: null };
}

export async function loadCameraBackgroundGallery(): Promise<{
  images: CameraBackgroundStoredImage[];
  selectedId: string | null;
}> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);
  const gallery = await readGallery(store);
  await txDone(tx);
  db.close();
  return { images: gallery.items, selectedId: gallery.selectedId };
}

/** Selected (or newest) blob — used by localMedia restore. */
export async function loadCameraBackgroundImage(): Promise<Blob | null> {
  const { images, selectedId } = await loadCameraBackgroundGallery();
  if (!images.length) return null;
  const selected = images.find((img) => img.id === selectedId) ?? images[images.length - 1];
  return selected?.blob ?? null;
}

export async function addCameraBackgroundImage(blob: Blob): Promise<{
  images: CameraBackgroundStoredImage[];
  selectedId: string;
  removedId: string | null;
}> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const gallery = await readGallery(store);

  const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  let items = [...gallery.items, { id, blob }];
  let removedId: string | null = null;
  while (items.length > CAMERA_BG_IMAGE_MAX) {
    const oldest = items.shift();
    if (!oldest) break;
    removedId = oldest.id;
  }

  const next: GalleryRecord = { items, selectedId: id };
  store.put(next, GALLERY_KEY);
  store.delete(LEGACY_KEY);
  await txDone(tx);
  db.close();
  return { images: items, selectedId: id, removedId };
}

export async function setSelectedCameraBackgroundImage(
  selectedId: string | null,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const gallery = await readGallery(store);
  const nextSelected =
    selectedId && gallery.items.some((item) => item.id === selectedId)
      ? selectedId
      : gallery.items[gallery.items.length - 1]?.id ?? null;
  store.put({ items: gallery.items, selectedId: nextSelected }, GALLERY_KEY);
  await txDone(tx);
  db.close();
}
