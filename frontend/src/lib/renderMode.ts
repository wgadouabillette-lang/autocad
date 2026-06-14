/** Description textuelle assez détaillée pour modéliser sans image (mode Render). */
export function isDetailedPartDescription(prompt: string): boolean {
  const t = prompt.trim();
  if (t.length < 100 || t === "(Attachments)") return false;
  const low = t.toLowerCase();
  const signals = [
    /\b\d+([.,]\d+)?\s*mm\b/,
    /\b\d+\s*[x×]\s*\d+/i,
    /[øØ]\s*\d+/,
    /\bdiam(ètre|eter)?\b/i,
    /\bM\d+\b/,
    /\b(épaisseur|epaisseur|hauteur|largeur|longueur|rayon|cote|côte)\b/i,
    /\b(trou|perçage|percage|boss|poche|épaulement|epaulement|bride|plaque|cylindre|chanfrein|congé)\b/i,
    /\b(plan|dessin|vue\s+de)\b/i,
  ];
  const hits = signals.filter((p) => p.test(low)).length;
  return hits >= 2;
}

/** Demande de modélisation 3D (mode Render) : image, description détaillée ou intention explicite. */
export function isRenderTask(prompt: string, hasImages: boolean): boolean {
  if (hasImages) return true;
  if (isDetailedPartDescription(prompt)) return true;

  const t = prompt.trim().toLowerCase();
  if (!t || t === "(Attachments)" || t === "(pièces jointes)") return false;

  const renderPatterns = [
    /\brender\b/i,
    /\bmod[ée]lis/i,
    /\bmodelis/i,
    /\bmodèle\s*3d/i,
    /\bplan\s+technique/i,
    /\bdepuis\s+(l[''])?image/i,
    /\bà\s+partir\s+(du\s+)?(plan|dessin|image)/i,
    /\b3d\s+depuis/i,
    /\brecréer?\s+(la\s+)?pièce/i,
    /\bconstruire?\s+(la\s+)?pièce\s+(3d|en\s+3d)/i,
    /\bpièce\s+(3d|en\s+3d)\s+(depuis|à\s+partir)/i,
    /\bfais(?:er)?\s+(?:moi\s+)?(?:la\s+|une\s+)?pièce/i,
    /\bfaire\s+(?:la\s+|une\s+)?pièce/i,
    /\bcréer?\s+(?:la\s+|une\s+)?pièce/i,
    /\b(?:générer|generer)\s+(?:la\s+|une\s+)?pièce/i,
  ];
  return renderPatterns.some((p) => p.test(t));
}
