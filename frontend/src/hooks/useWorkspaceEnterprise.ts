import { useEffect } from "react";
import { effectiveWorkspaceEnterprise } from "../lib/subscriptionPlans";
import { watchSharedWorkspaceDoc } from "../lib/firebase/workspaceRegistry";
import { useAuthStore } from "../store/useAuthStore";
import { useStore } from "../store/useStore";

export function useWorkspaceEnterprise(): void {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const firebaseUid = useAuthStore((s) => s.firebaseUid);

  useEffect(() => {
    const workspaceId = activeRoomId.trim().toLowerCase();
    if (!isAuthenticated || !firebaseUid || !workspaceId) {
      useStore.setState({ workspaceEnterpriseActive: false });
      return;
    }

    return watchSharedWorkspaceDoc(
      workspaceId,
      (data) => {
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
  }, [activeRoomId, firebaseUid, isAuthenticated]);
}
