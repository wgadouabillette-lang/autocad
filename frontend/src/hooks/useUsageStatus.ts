import { useCallback, useEffect, useState } from "react";
import { billingApi, type UsageStatus } from "../lib/billingApi";
import { AI_USAGE_UPDATED_EVENT } from "../lib/usageEvents";

const DEFAULT_POLL_MS = 20_000;

interface UsageHookState {
  usage: UsageStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function useUsageLoader(
  load: () => Promise<UsageStatus>,
  enabled: boolean,
  pollMs = DEFAULT_POLL_MS,
): UsageHookState {
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await load();
      setUsage(data);
    } catch (err: unknown) {
      setUsage(null);
      setError(err instanceof Error ? err.message : "Impossible de charger l'usage IA.");
    } finally {
      setLoading(false);
    }
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled) {
      setUsage(null);
      setError(null);
      setLoading(false);
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || pollMs <= 0) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [enabled, pollMs, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onUsageUpdated = () => void refresh();
    window.addEventListener(AI_USAGE_UPDATED_EVENT, onUsageUpdated);
    return () => window.removeEventListener(AI_USAGE_UPDATED_EVENT, onUsageUpdated);
  }, [enabled, refresh]);

  return { usage, loading, error, refresh };
}

export function usePersonalUsage(enabled: boolean, pollMs = DEFAULT_POLL_MS): UsageHookState {
  const load = useCallback(() => billingApi.usage(), []);
  return useUsageLoader(load, enabled, pollMs);
}

export function useEnterpriseUsage(
  workspaceId: string,
  enabled: boolean,
  pollMs = DEFAULT_POLL_MS,
): UsageHookState {
  const wid = workspaceId.trim().toLowerCase();
  const load = useCallback(() => billingApi.enterpriseUsage(wid), [wid]);
  return useUsageLoader(load, enabled && wid.length > 0, pollMs);
}

export function usagePercent(used: number, allowance: number): number {
  if (allowance <= 0) return 0;
  return Math.min(100, Math.round((used / allowance) * 100));
}

export function onDemandPercent(used: number, limit: number | null | undefined): number {
  if (limit == null || limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}
