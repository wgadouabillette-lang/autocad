import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import type { EnterpriseWorkspaceOption } from "../lib/billingApi";
import { db } from "../lib/firebase/client";
import { effectiveWorkspaceEnterprise } from "../lib/subscriptionPlans";
import { useAuthStore } from "../store/useAuthStore";
import { useWorkspacesStore } from "../store/useWorkspacesStore";

export type BoostedWorkspace = {
  workspaceId: string;
  name: string;
  paidByMe: boolean;
  cancelAtPeriodEnd: boolean;
  canCancel: boolean;
};

/**
 * Workspaces boostés (Entreprise) accessibles à l'utilisateur — y compris ceux
 * payés par un autre membre du même serveur.
 */
export function useBoostedWorkspaces(
  enterpriseWorkspaces: EnterpriseWorkspaceOption[] = [],
): BoostedWorkspace[] {
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const customServers = useWorkspacesStore((s) => s.customServers);
  const memberships = useWorkspacesStore((s) => s.memberships);

  const billingById = useMemo(() => {
    const map = new Map<string, EnterpriseWorkspaceOption>();
    for (const workspace of enterpriseWorkspaces) {
      map.set(workspace.workspaceId.trim().toLowerCase(), workspace);
    }
    return map;
  }, [enterpriseWorkspaces]);

  const candidateIds = useMemo(() => {
    const ids = new Set<string>();
    for (const server of customServers) {
      const id = server.id.trim().toLowerCase();
      if (id) ids.add(id);
    }
    for (const entry of memberships) {
      if (firebaseUid && entry.userId !== firebaseUid) continue;
      const id = entry.workspaceId.trim().toLowerCase();
      if (id) ids.add(id);
    }
    for (const workspace of enterpriseWorkspaces) {
      if (workspace.enterpriseActive) {
        ids.add(workspace.workspaceId.trim().toLowerCase());
      }
    }
    return Array.from(ids).sort();
  }, [customServers, memberships, firebaseUid, enterpriseWorkspaces]);

  const nameHints = useMemo(() => {
    const map = new Map<string, string>();
    for (const server of customServers) {
      map.set(server.id.trim().toLowerCase(), server.name);
    }
    for (const workspace of enterpriseWorkspaces) {
      map.set(workspace.workspaceId.trim().toLowerCase(), workspace.name);
    }
    return map;
  }, [customServers, enterpriseWorkspaces]);

  const [liveNames, setLiveNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!isAuthenticated || !firebaseUid || candidateIds.length === 0) {
      setLiveNames(new Map());
      return;
    }

    const active = new Map<string, string>();
    const unsubs = candidateIds.map((workspaceId) =>
      onSnapshot(
        doc(db, "workspacesShared", workspaceId),
        (snap) => {
          if (!snap.exists()) {
            active.delete(workspaceId);
          } else {
            const data = snap.data();
            const boosted = effectiveWorkspaceEnterprise(
              data?.enterpriseSubscriptionPlan,
              data?.enterpriseBillingManaged,
            );
            if (boosted) {
              const name =
                String(data?.name || "").trim() ||
                nameHints.get(workspaceId) ||
                workspaceId;
              active.set(workspaceId, name);
            } else {
              active.delete(workspaceId);
            }
          }
          setLiveNames(new Map(active));
        },
        () => {
          active.delete(workspaceId);
          setLiveNames(new Map(active));
        },
      ),
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [candidateIds, firebaseUid, isAuthenticated, nameHints]);

  return useMemo(() => {
    const ids =
      liveNames.size > 0
        ? Array.from(liveNames.keys())
        : enterpriseWorkspaces
            .filter((workspace) => workspace.enterpriseActive)
            .map((workspace) => workspace.workspaceId.trim().toLowerCase());

    return ids
      .map((workspaceId) => {
        const billing = billingById.get(workspaceId);
        const name =
          liveNames.get(workspaceId) ||
          billing?.name ||
          nameHints.get(workspaceId) ||
          workspaceId;
        const paidByMe = Boolean(billing?.paidByMe);
        const cancelAtPeriodEnd = Boolean(billing?.cancelAtPeriodEnd);
        return {
          workspaceId,
          name,
          paidByMe,
          cancelAtPeriodEnd,
          canCancel: Boolean(billing?.canCancel) && paidByMe && !cancelAtPeriodEnd,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [liveNames, enterpriseWorkspaces, billingById, nameHints]);
}
