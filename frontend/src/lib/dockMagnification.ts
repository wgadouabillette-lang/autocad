export const WORKSPACE_TILE_BASE_PX = 44;
export const WORKSPACE_DOCK_MAX_SCALE = 1.22;
export const WORKSPACE_TILE_SLOT_PX = WORKSPACE_TILE_BASE_PX * WORKSPACE_DOCK_MAX_SCALE;
export const WORKSPACE_TILE_SLOT_GAP_PX = 4;

/** Effet dock macOS : scale max au curseur, décroissance progressive sur les voisins. */
export function dockMagnificationScale(
  distancePx: number,
  options?: { maxScale?: number; influencePx?: number },
): number {
  const maxScale = options?.maxScale ?? WORKSPACE_DOCK_MAX_SCALE;
  const influencePx = options?.influencePx ?? 58;
  if (distancePx <= 0) return maxScale;
  const boost = maxScale - 1;
  const falloff = Math.exp(-(distancePx * distancePx) / (2 * influencePx * influencePx));
  return 1 + boost * falloff;
}

/** Centre vertical fixe de chaque slot (gap et hauteur max réservés dès le départ). */
export function dockSlotCenter(
  index: number,
  slot = WORKSPACE_TILE_SLOT_PX,
  gap = WORKSPACE_TILE_SLOT_GAP_PX,
): number {
  return index * (slot + gap) + slot / 2;
}

export function dockSlotCenters(
  count: number,
  slot = WORKSPACE_TILE_SLOT_PX,
  gap = WORKSPACE_TILE_SLOT_GAP_PX,
): number[] {
  return Array.from({ length: count }, (_, index) => dockSlotCenter(index, slot, gap));
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
