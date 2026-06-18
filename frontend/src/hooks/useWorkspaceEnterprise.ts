import { useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { effectiveWorkspaceEnterprise } from "../lib/subscriptionPlans";
import { db } from "../lib/firebase/client";
import { useStore } from "../store/useStore";

export function useWorkspaceEnterprise(): void {
  const activeRoomId = useStore((s) => s.activeRoomId);

  useEffect(() => {
    const workspaceId = activeRoomId.trim().toLowerCase();
    if (!workspaceId) {
      useStore.setState({ workspaceEnterpriseActive: false });
      return;
    }

    const ref = doc(db, "workspacesShared", workspaceId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? snap.data() : null;
        const active = effectiveWorkspaceEnterprise(
          data?.enterpriseSubscriptionPlan,
          data?.enterpriseBillingManaged,
        );
        useStore.setState({ workspaceEnterpriseActive: active });
      },
      () => {
        useStore.setState({ workspaceEnterpriseActive: false });
      },
    );

    return unsubscribe;
  }, [activeRoomId]);
}
