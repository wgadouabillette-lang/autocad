import clsx from "clsx";
import {
  Bot,
  Cpu,
  Gauge,
  LayoutGrid,
  LogOut,
  Mic,
  Plug,
  Settings,
  Users,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import {
  normalizeSettingsTab,
  type SettingsTab,
} from "../lib/settingsSearchSuggestions";
import { useStore } from "../store/useStore";
import FriendsSettingsSection from "./settings/FriendsSettingsSection";
import GeneralSettingsSection from "./settings/GeneralSettingsSection";
import ModelsSettingsSection from "./settings/ModelsSettingsSection";
import PluginsSettingsSection from "./settings/PluginsSettingsSection";
import AgentsSettingsSection from "./settings/AgentsSettingsSection";
import AudioSettingsSection from "./settings/AudioSettingsSection";
import UsageSettingsSection from "./settings/UsageSettingsSection";
import VoiceSettingsSection from "./settings/VoiceSettingsSection";
import { useAuthStore } from "../store/useAuthStore";
import SettingsProfileHeader from "./settings/SettingsProfileHeader";
import WorkspacesSettingsSection from "./settings/WorkspacesSettingsSection";

type NavItem =
  | { kind: "tab"; id: SettingsTab; label: string }
  | { kind: "separator" };

const TAB_TITLES: Record<SettingsTab, string> = {
  general: "General",
  friends: "Friends",
  workspaces: "Workspaces",
  usage: "Plan & Usage",
  agents: "Agents",
  voice: "Voice",
  audio: "Audio",
  models: "Models",
  plugins: "Plugins",
};

const TAB_DESCRIPTIONS: Record<SettingsTab, string> = {
  general: "Profil, interface et apparence.",
  friends: "Amis et invitations.",
  workspaces: "Vos workspaces, invitations et consommation IA Entreprise.",
  usage: "Forfait, facturation et consommation.",
  agents: "Personnalisation du chat, des follow-ups et des AI Notes.",
  voice: "Salons vocaux, enregistrements et options de capture.",
  audio: "Micro, sortie audio et traitement du signal.",
  models: "Choix du modèle IA pour la génération.",
  plugins: "Connecteurs utilisables dans le chat.",
};

const TAB_ICONS: Record<SettingsTab, LucideIcon> = {
  general: Settings,
  friends: Users,
  workspaces: LayoutGrid,
  usage: Gauge,
  agents: Bot,
  voice: Mic,
  audio: Volume2,
  models: Cpu,
  plugins: Plug,
};

const TAB_PANELS: Record<SettingsTab, () => JSX.Element> = {
  general: GeneralSettingsSection,
  friends: FriendsSettingsSection,
  workspaces: WorkspacesSettingsSection,
  usage: UsageSettingsSection,
  agents: AgentsSettingsSection,
  voice: VoiceSettingsSection,
  audio: AudioSettingsSection,
  models: ModelsSettingsSection,
  plugins: PluginsSettingsSection,
};

function buildNav(): NavItem[] {
  const items: NavItem[] = [
    { kind: "tab", id: "general", label: "General" },
    { kind: "tab", id: "friends", label: "Friends" },
    { kind: "tab", id: "workspaces", label: "Workspaces" },
  ];
  items.push(
    { kind: "separator" },
    { kind: "tab", id: "usage", label: "Plan & Usage" },
    { kind: "tab", id: "agents", label: "Agents" },
    { kind: "tab", id: "voice", label: "Voice" },
    { kind: "tab", id: "audio", label: "Audio" },
    { kind: "tab", id: "models", label: "Models" },
    { kind: "separator" },
    { kind: "tab", id: "plugins", label: "Plugins" },
  );
  return items;
}

export default function SettingsPage() {
  const activeTab = useStore((s) => s.settingsTab);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const signOut = useAuthStore((s) => s.signOut);
  const panelBodyRef = useRef<HTMLDivElement>(null);
  const navItems = useMemo(() => buildNav(), []);
  const resolvedTab = useMemo(() => normalizeSettingsTab(activeTab), [activeTab]);
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
