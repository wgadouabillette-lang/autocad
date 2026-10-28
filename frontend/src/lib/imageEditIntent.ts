function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** True when the prompt asks to edit an attached image. */
export function isImageEditRequest(text: string): boolean {
  const folded = fold(text);
  if (/edition d[' ]?image/.test(folded)) return true;
  if (/\bimage edit(?:ing)?\b/.test(folded)) return true;
  if (/\bedit(?:ing)? (?:the |this |my )?(?:image|photo|picture)\b/.test(folded)) return true;
  if (
    /\b(?:modifie|modifier|edite|editer|retouche|retoucher)\b/.test(folded) &&
    /\b(?:image|photo|picture)\b/.test(folded)
  ) {
    return true;
  }
  return false;
}

/** The label alone is not an edit instruction. */
export function imageEditNeedsInstruction(text: string): boolean {
  const folded = fold(text).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const instruction = folded
    .replace(/\bedition d image\b/g, " ")
    .replace(/\bimage editing\b/g, " ")
    .replace(/\bimage edit\b/g, " ")
    .replace(/\bediting (?:the |this |my )?(?:image|photo|picture)\b/g, " ")
    .replace(/\bedit (?:the |this |my )?(?:image|photo|picture)\b/g, " ")
    .replace(
      /\b(?:modifie|modifier|edite|editer|retouche|retoucher) (?:l |cette |la |the |this )?(?:image|photo|picture)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  return instruction.length < 3;
}

export function compressEditedImage(dataBase64: string, mime: string): Promise<string> {
  const src = `data:${mime || "image/png"};base64,${dataBase64}`;
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const maxEdge = 960;
      const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(src);
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.onerror = () => reject(new Error("Image modifiée illisible."));
    image.src = src;
  });
}
