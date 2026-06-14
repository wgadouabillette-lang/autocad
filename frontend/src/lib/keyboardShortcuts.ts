export type AppShortcutId = "recording" | "mute" | "panel";

export interface AppShortcut {
  id: AppShortcutId;
  label: string;
  key: string;
  /** false = affiché seulement, pas encore branché */
  enabled?: boolean;
}

export const APP_SHORTCUTS: AppShortcut[] = [
  { id: "recording", label: "Start / stop recording", key: "E" },
  { id: "mute", label: "Mute / unmute", key: "M" },
  { id: "panel", label: "Switch content", key: "P" },
];

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform || navigator.userAgent;
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

export function shortcutModifierLabel(): string {
  return isMacPlatform() ? "⌘" : "Shift";
}

/** Symbole affiché dans les touches carrées (⇧ tient dans le carré). */
export function shortcutModifierSymbol(): string {
  return isMacPlatform() ? "⌘" : "⇧";
}

export function shortcutModifierPressed(event: KeyboardEvent): boolean {
  if (isMacPlatform()) {
    return event.metaKey && !event.ctrlKey && !event.altKey;
  }
  return event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;
}

export function matchAppShortcut(event: KeyboardEvent): AppShortcutId | null {
  if (!shortcutModifierPressed(event)) return null;
  const key = event.key.length === 1 ? event.key.toUpperCase() : "";
  const found = APP_SHORTCUTS.find(
    (shortcut) => shortcut.key === key && shortcut.enabled !== false,
  );
  return found?.id ?? null;
}
