export const ROULETTE_WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20,
  14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type RouletteColor = "green" | "red" | "black";

export function rouletteColor(value: number): RouletteColor {
  if (value === 0) return "green";
  return RED_NUMBERS.has(value) ? "red" : "black";
}

export function rouletteColorLabel(color: RouletteColor): string {
  if (color === "green") return "Green";
  if (color === "red") return "Red";
  return "Black";
}

export function pickRouletteOutcome(): number {
  return ROULETTE_WHEEL_ORDER[Math.floor(Math.random() * ROULETTE_WHEEL_ORDER.length)];
}

export function rouletteSegmentAngle(): number {
  return 360 / ROULETTE_WHEEL_ORDER.length;
}

export function rotationForOutcome(outcome: number, currentRotation: number): number {
  const index = ROULETTE_WHEEL_ORDER.indexOf(outcome as (typeof ROULETTE_WHEEL_ORDER)[number]);
  const safeIndex = index >= 0 ? index : 0;
  const segment = rouletteSegmentAngle();
  const targetCenter = safeIndex * segment + segment / 2;
  const normalized = ((currentRotation % 360) + 360) % 360;
  const delta = (360 - targetCenter - normalized + 360) % 360;
  return currentRotation + delta + 360 * (5 + Math.floor(Math.random() * 3));
}
