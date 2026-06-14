import clsx from "clsx";
import {
  Bot,
  Cpu,
  Gauge,
  LogOut,
  Plug,
  Server,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import {
  normalizeSettingsTab,
  type SettingsTab,
} from "../lib/settingsSearchSuggestions";
import { useStore } from "../store/useStore";
import { useWorkspacesStore } from "../store/useWorkspacesStore";
import FriendsSettingsSection from "./settings/FriendsSettingsSection";
import GeneralSettingsSection from "./settings/GeneralSettingsSection";
import ModelsSettingsSection from "./settings/ModelsSettingsSection";
import PluginsSettingsSection from "./settings/PluginsSettingsSection";
import AgentsSettingsSection from "./settings/AgentsSettingsSection";
import UsageSettingsSection from "./settings/UsageSettingsSection";
import { useAuthStore } from "../store/useAuthStore";
import SettingsProfileHeader from "./settings/SettingsProfileHeader";
import WorkspaceSettingsSection from "./settings/WorkspaceSettingsSection";

type NavItem =
  | { kind: "tab"; id: SettingsTab; label: string }
  | { kind: "separator" };

const TAB_TITLES: Record<SettingsTab, string> = {
  general: "General",
  friends: "Friends",
  usage: "Plan & Usage",
  agents: "Agents",
  models: "Models",
  plugins: "Plugins",
  workspace: "Workspace",
};

const TAB_DESCRIPTIONS: Record<SettingsTab, string> = {
  general: "Profil, interface, apparence et enregistrement.",
  friends: "Amis et invitations.",
  usage: "Forfait, facturation et consommation.",
  agents: "Personnalisation du chat, des follow-ups et des AI Notes.",
  models: "Choix du modèle IA pour la génération.",
  plugins: "Connecteurs utilisables dans le chat.",
  workspace: "Paramètres du workspace actif — réservés au propriétaire.",
};

const TAB_ICONS: Record<SettingsTab, LucideIcon> = {
  general: Settings,
  friends: Users,
  workspace: Server,
  usage: Gauge,
  agents: Bot,
  models: Cpu,
  plugins: Plug,
};

const TAB_PANELS: Record<SettingsTab, () => JSX.Element> = {
  general: GeneralSettingsSection,
  friends: FriendsSettingsSection,
  usage: UsageSettingsSection,
  agents: AgentsSettingsSection,
  models: ModelsSettingsSection,
  plugins: PluginsSettingsSection,
  workspace: WorkspaceSettingsSection,
};

function buildNav(isWorkspaceOwner: boolean): NavItem[] {
  const items: NavItem[] = [
    { kind: "tab", id: "general", label: "General" },
    { kind: "tab", id: "friends", label: "Friends" },
  ];
  if (isWorkspaceOwner) {
    items.push({ kind: "tab", id: "workspace", label: "Workspace" });
  }
  items.push(
    { kind: "separator" },
    { kind: "tab", id: "usage", label: "Plan & Usage" },
    { kind: "tab", id: "agents", label: "Agents" },
    { kind: "tab", id: "models", label: "Models" },
    { kind: "separator" },
    { kind: "tab", id: "plugins", label: "Plugins" },
  );
  return items;
}

export default function SettingsPage() {
  const activeTab = useStore((s) => s.settingsTab);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const isWorkspaceOwner = useWorkspacesStore((s) => s.isWorkspaceOwner(activeRoomId));
  const signOut = useAuthStore((s) => s.signOut);
  const panelBodyRef = useRef<HTMLDivElement>(null);
  const navItems = useMemo(() => buildNav(isWorkspaceOwner), [isWorkspaceOwner]);
  const resolvedTab = useMemo(() => {
    const tab = normalizeSettingsTab(activeTab);
    if (tab === "workspace" && !isWorkspaceOwner) return "general";
    return tab;
  }, [activeTab, isWorkspaceOwner]);
  const Panel = TAB_PANELS[resolvedTab] ?? GeneralSettingsSection;

  useEffect(() => {
    panelBodyRef.current?.scrollTo(0, 0);
  }, [resolvedTab]);

  useEffect(() => {
    if (resolvedTab !== activeTab) {
      setSettingsTab(resolvedTab);
    }
  }, [activeTab, resolvedTab, setSettingsTab]);

  return (
    <div className="settings-view">
      <div className="settings-view__frame">
        <div className="settings-view__layout">
          <nav className="settings-view__nav" aria-label="Settings sections">
            <SettingsProfileHeader />
            <ul className="settings-view__tabs">
              {navItems.map((item, index) => {
                if (item.kind === "separator") {
                  return (
                    <li
                      key={`sep-${index}`}
                      className="settings-view__tabs-separator"
                      aria-hidden
                    />
                  );
                }

                const Icon = TAB_ICONS[item.id];
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={clsx(
                        "settings-view__tab",
                        resolvedTab === item.id && "settings-view__tab--active",
                      )}
                      onClick={() => setSettingsTab(item.id)}
                      aria-current={resolvedTab === item.id ? "page" : undefined}
                    >
                      <Icon size={14} strokeWidth={2} className="settings-view__tab-icon" aria-hidden />
                      {item.label}
                    </button>
                  </li>
                );
              })}
              <li className="settings-view__tabs-logout">
                <button
                  type="button"
                  className="settings-view__logout"
                  onClick={() => void signOut()}
                >
                  <LogOut size={14} aria-hidden />
                  Déconnexion
                </button>
              </li>
            </ul>
          </nav>

          <div className="settings-view__panel">
            <header className="settings-view__panel-header">
              <h2 className="settings-view__panel-title">{TAB_TITLES[resolvedTab]}</h2>
              <p className="settings-view__panel-desc">{TAB_DESCRIPTIONS[resolvedTab]}</p>
            </header>

            <div ref={panelBodyRef} className="settings-view__panel-body">
              <Panel />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
