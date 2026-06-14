import type { CSSProperties } from "react";

export type VoiceParticipantTileShape = "fill" | "wide" | "square";

export interface VoiceParticipantGridLayout {
  gridClass: string;
  tileShape: VoiceParticipantTileShape;
  rowCount: number;
  useFlexibleRows: boolean;
}

/** Grille vocale adaptée au nombre de participants. */
export function voiceParticipantGridLayout(count: number): VoiceParticipantGridLayout {
  if (count <= 0) {
    return {
      gridClass: "",
      tileShape: "fill",
      rowCount: 1,
      useFlexibleRows: false,
    };
  }
  if (count === 1) {
    return {
      gridClass: "open-voice-in-call__grid--solo",
      tileShape: "fill",
      rowCount: 1,
      useFlexibleRows: false,
    };
  }
  if (count === 2) {
    return {
      gridClass: "open-voice-in-call__grid--duo",
      tileShape: "wide",
      rowCount: 1,
      useFlexibleRows: true,
    };
  }
  if (count === 3) {
    return {
      gridClass: "open-voice-in-call__grid--duo-odd-last",
      tileShape: "wide",
      rowCount: 2,
      useFlexibleRows: true,
    };
  }
  if (count === 4) {
    return {
      gridClass: "open-voice-in-call__grid--quad",
      tileShape: "wide",
      rowCount: 2,
      useFlexibleRows: true,
    };
  }
  if (count === 5) {
    return {
      gridClass: "open-voice-in-call__grid--five",
      tileShape: "square",
      rowCount: 2,
      useFlexibleRows: false,
    };
  }
  if (count === 6) {
    return {
      gridClass: "open-voice-in-call__grid--six",
      tileShape: "square",
      rowCount: 2,
      useFlexibleRows: false,
    };
  }

  const rowCount = Math.ceil(count / 3);
  const remainder = count % 3;
  return {
    gridClass:
      remainder === 0
        ? "open-voice-in-call__grid--triple"
        : "open-voice-in-call__grid--triple-odd-last",
    tileShape: "square",
    rowCount,
    useFlexibleRows: false,
  };
}

/** Placement sur grille 6 colonnes (3 tuiles par rangée, dernière rangée centrée). */
export function voiceParticipantTilePlacement(
  count: number,
  index: number,
): CSSProperties | undefined {
  if (count < 5) return undefined;

  const lastRowStart = Math.floor((count - 1) / 3) * 3;
  const lastRowCount = count - lastRowStart;

  if (count === 5) {
    if (index < 3) return { gridColumn: "span 2" };
    if (index === 3) return { gridColumn: "2 / span 2" };
    if (index === 4) return { gridColumn: "4 / span 2" };
  }

  if (index < lastRowStart) {
    return { gridColumn: "span 2" };
  }

  if (lastRowCount === 1) {
    return { gridColumn: "3 / span 2" };
  }
  if (lastRowCount === 2) {
    return { gridColumn: index === lastRowStart ? "2 / span 2" : "4 / span 2" };
  }

  return { gridColumn: "span 2" };
}

export function voiceParticipantTileShapeClass(
  shape: VoiceParticipantTileShape,
): string | null {
  if (shape === "wide") return "voice-participant-tile--fill-wide";
  if (shape === "square") return "voice-participant-tile--fill-square";
  return "voice-participant-tile--fill";
}
