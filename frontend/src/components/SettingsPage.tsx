import clsx from "clsx";
import {
  Bot,
  Cpu,
  CreditCard,
  Gauge,
  LayoutGrid,
  LogOut,
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
import BillingSettingsSection from "./settings/BillingSettingsSection";
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
  billing: "Billing",
  agents: "Agents",
  audio: "Audio & Video",
  models: "Models",
  plugins: "Plugins",
};

const TAB_DESCRIPTIONS: Record<SettingsTab, string> = {
  general: "",
  friends: "Amis et invitations.",
  workspaces: "Vos workspaces, invitations et consommation IA Entreprise.",
  usage: "Forfaits, consommation IA et comparaison des plans.",
  billing: "Forfait actuel et date de prochain prélèvement.",
  agents: "Personnalisation du chat, des follow-ups et des AI Notes.",
  audio: "",
  models: "Choix du modèle IA pour la génération.",
  plugins: "Connecteurs utilisables dans le chat.",
};

const TAB_ICONS: Record<SettingsTab, LucideIcon> = {
  general: Settings,
  friends: Users,
  workspaces: LayoutGrid,
  usage: Gauge,
  billing: CreditCard,
  agents: Bot,
  audio: Volume2,
  models: Cpu,
  plugins: Plug,
};

const TAB_PANELS: Record<SettingsTab, () => JSX.Element> = {
  general: GeneralSettingsSection,
  friends: FriendsSettingsSection,
  workspaces: WorkspacesSettingsSection,
  usage: UsageSettingsSection,
  billing: BillingSettingsSection,
  agents: AgentsSettingsSection,
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
    { kind: "tab", id: "plugins", label: "Plugins" },
    { kind: "tab", id: "agents", label: "Agents" },
    { kind: "tab", id: "models", label: "Models" },
    { kind: "tab", id: "audio", label: "Audio & Video" },
    { kind: "separator" },
    { kind: "tab", id: "usage", label: "Plan & Usage" },
    { kind: "tab", id: "billing", label: "Billing" },
  );
  return items;
}

export default function SettingsPage() {
  const activeTab = useStore((s) => s.settingsTab);
  const settingsScrollTarget = useStore((s) => s.settingsScrollTarget);
  const clearSettingsScrollTarget = useStore((s) => s.clearSettingsScrollTarget);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const closePage = useStore((s) => s.closePage);
  const signOut = useAuthStore((s) => s.signOut);
  const panelBodyRef = useRef<HTMLDivElement>(null);
  const navItems = useMemo(() => buildNav(), []);
  const resolvedTab = useMemo(() => normalizeSettingsTab(activeTab), [activeTab]);
  const Panel = TAB_PANELS[resolvedTab] ?? GeneralSettingsSection;

  useEffect(() => {
    if (settingsScrollTarget) return;
    panelBodyRef.current?.scrollTo(0, 0);
  }, [resolvedTab, settingsScrollTarget]);

  useEffect(() => {
    if (resolvedTab !== activeTab) {
      setSettingsTab(resolvedTab);
    }
  }, [activeTab, resolvedTab, setSettingsTab]);

  useEffect(() => {
    if (!settingsScrollTarget) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(settingsScrollTarget);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      clearSettingsScrollTarget();
    });
    return () => cancelAnimationFrame(frame);
  }, [settingsScrollTarget, resolvedTab, clearSettingsScrollTarget]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePage("settings");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePage]);

  return (
    <div className="settings-view">
      <div className="settings-view__frame">
        <div className="settings-view__layout">
          <nav className="settings-view__nav" aria-label="Settings sections">
            <SettingsProfileHeader onBack={() => closePage("settings")} />
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
              <div className="settings-view__panel-content">
                <h2 className="settings-view__panel-title">{TAB_TITLES[resolvedTab]}</h2>
                {TAB_DESCRIPTIONS[resolvedTab] ? (
                  <p className="settings-view__panel-desc">{TAB_DESCRIPTIONS[resolvedTab]}</p>
                ) : null}
              </div>
            </header>

            <div ref={panelBodyRef} className="settings-view__panel-body">
              <div className="settings-view__panel-content">
                <div key={resolvedTab} className="settings-view__panel-slot">
                  <Panel />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
