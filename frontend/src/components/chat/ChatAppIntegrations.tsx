import clsx from "clsx";
import { Plus } from "lucide-react";
import { CHAT_CONNECTOR_PREVIEW_COUNT, CHAT_CONNECTORS } from "./chatConnectors";
import type { ChatAppLogoComponent } from "./chatAppLogos";

function AppCircle({
  label,
  Logo,
  stackIndex,
}: {
  label: string;
  Logo: ChatAppLogoComponent;
  stackIndex: number;
}) {
  return (
    <span
      className="chat-app-circle pointer-events-none"
      style={{ zIndex: stackIndex + 1 }}
      title={label}
      aria-hidden
    >
      <Logo />
    </span>
  );
}

export default function ChatAppIntegrations({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const visibleApps = CHAT_CONNECTORS.slice(0, CHAT_CONNECTOR_PREVIEW_COUNT);

  return (
    <button
      type="button"
      className={clsx("chat-apps-capsule", open && "is-open")}
      title="Connectors"
      aria-label="Connectors"
      aria-expanded={open}
      onClick={onToggle}
    >
      <span className="chat-apps-stack">
        {visibleApps.map(({ id, label, Logo }, index) => (
          <AppCircle key={id} label={label} Logo={Logo} stackIndex={index} />
        ))}
        <span
          className="chat-app-circle chat-app-circle--more chat-app-circle--stacked pointer-events-none"
          style={{ zIndex: visibleApps.length + 1 }}
          aria-hidden
        >
          <Plus size={11} strokeWidth={2.5} />
        </span>
      </span>
    </button>
  );
}
