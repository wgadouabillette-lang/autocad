/** Largeurs de la grille salons vocaux — alignées sur index.css */
export const CALLS_SIDE_COL_WIDTH_REM = 11;
export const CALLS_CENTER_COL_WIDTH_REM = 18;
export const CALLS_GRID_GAP_REM = 0.5;
export const CALLS_MOBILE_BREAKPOINT_PX = 768;

export type CallsGridColumnCount = 1 | 2 | 3 | 4 | 5;

function effectiveCenterColWidthRem(availableWidthPx: number, rootFontSizePx: number): number {
  if (availableWidthPx < CALLS_MOBILE_BREAKPOINT_PX) {
    return Math.max(11, (availableWidthPx - rootFontSizePx * 0.5) / rootFontSizePx);
  }
  return CALLS_CENTER_COL_WIDTH_REM;
}

function gridWidthRem(columnCount: CallsGridColumnCount, centerWidthRem = CALLS_CENTER_COL_WIDTH_REM): number {
  const side = CALLS_SIDE_COL_WIDTH_REM;
  const center = centerWidthRem;
  const gap = CALLS_GRID_GAP_REM;
  const gaps = Math.max(0, columnCount - 1) * gap;

  switch (columnCount) {
    case 5:
      return 4 * side + center + gaps;
    case 4:
      return 3 * side + center + gaps;
    case 3:
      return 2 * side + center + gaps;
    case 2:
      return side + center + gaps;
    case 1:
      return center;
  }
}

/** Nombre total de colonnes (5 → 4 → 3 → 2 → 1) selon la largeur dispo. */
export function callsGridColumnCount(
  availableWidthPx: number,
  rootFontSizePx: number,
): CallsGridColumnCount {
  const rem = rootFontSizePx || 16;
  const toPx = (valueRem: number) => valueRem * rem;
  const centerWidthRem = effectiveCenterColWidthRem(availableWidthPx, rem);
  // Tolérance légère : évite de retomber à 1 colonne sur de faux positifs de mesure.
  const width = availableWidthPx + rem * 0.5;

  if (width >= toPx(gridWidthRem(5, centerWidthRem))) return 5;
  if (width >= toPx(gridWidthRem(4, centerWidthRem))) return 4;
  if (width >= toPx(gridWidthRem(3, centerWidthRem))) return 3;
  if (width >= toPx(gridWidthRem(2, centerWidthRem))) return 2;
  return 1;
}
