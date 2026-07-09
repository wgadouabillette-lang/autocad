import clsx from "clsx";
import { APP_SHORTCUTS, HALL_DJ_SKIP_SHORTCUT, shortcutModifierSymbol, type AppShortcut } from "../../lib/keyboardShortcuts";

function ShortcutKey({ label }: { label: string }) {
  return (
    <span className="chat-shortcuts-hint__key-capsule" aria-hidden>
      <kbd className="chat-shortcuts-hint__key">{label}</kbd>
    </span>
  );
}

function ShortcutKeys({ keys }: { keys: string[] }) {
  return (
    <span className="chat-shortcuts-hint__keys">
      {keys.map((key, index) => (
        <span key={`${key}-${index}`} className="chat-shortcuts-hint__key-group">
          {index > 0 && <span className="chat-shortcuts-hint__plus" aria-hidden>+</span>}
          <ShortcutKey label={key} />
        </span>
      ))}
    </span>
  );
}

export default function ChatShortcutsHint({
  showHallDjSkip = false,
}: {
  showHallDjSkip?: boolean;
}) {
  const modifier = shortcutModifierSymbol();
  const shortcuts: AppShortcut[] = showHallDjSkip
    ? [...APP_SHORTCUTS, HALL_DJ_SKIP_SHORTCUT]
    : APP_SHORTCUTS;

  return (
    <section className="chat-shortcuts-hint" aria-label="Keyboard shortcuts">
      <ul className="chat-shortcuts-hint__list">
        {shortcuts.map((shortcut) => (
          <li
            key={shortcut.id}
            className={clsx(
              "chat-shortcuts-hint__row",
              shortcut.id === "djSkip" && "chat-shortcuts-hint__row--dj-skip",
            )}
          >
            <span className="chat-shortcuts-hint__label">{shortcut.label}</span>
            <ShortcutKeys keys={[modifier, shortcut.key]} />
          </li>
        ))}
      </ul>
    </section>
  );
}
