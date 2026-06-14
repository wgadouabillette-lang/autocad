export interface AgentImagePayload {
  mime: string;
  data_b64: string;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unable to read file"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function loadImageDimensions(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Unreadable image: ${file.name}`));
    };
    img.src = url;
  });
}

/** Vérifie que l'image respecte les contraintes xAI (min. 8×8 px). */
export async function validateAgentImages(files: File[]): Promise<string | null> {
  const images = files.filter((f) => f.type.startsWith("image/"));
  if (images.length === 0) return "No valid image.";
  for (const file of images) {
    const { w, h } = await loadImageDimensions(file);
    if (w < 8 || h < 8) {
      return `Image too small (${w}×${h} px). Minimum 8×8 pixels for Grok.`;
    }
  }
  return null;
}

/** Encode les images jointes pour l'API agent (@Modelling). */
export async function filesToAgentImages(files: File[]): Promise<AgentImagePayload[]> {
  const images = files.filter((f) => f.type.startsWith("image/"));
  const out: AgentImagePayload[] = [];
  for (const file of images.slice(0, 4)) {
    const data_b64 = await readFileAsBase64(file);
    out.push({ mime: file.type || "image/png", data_b64 });
  }
  return out;
}
