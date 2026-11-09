import { billingApi } from "./billingApi";
import {
  countWorkspaceMembers,
  fetchSharedWorkspaceDoc,
} from "./firebase/workspaceRegistry";
import { useStore } from "../store/useStore";

export type WorkspaceSeatCounts = {
  filled: number;
  capacity: number;
};

/**
 * Sièges occupés / sièges du workspace.
 * null seulement quand le quota n'a pas pu être lu.
 */
export async function loadWorkspaceSeatCounts(
  workspaceId: string,
): Promise<WorkspaceSeatCounts | null> {
  const trimmed = workspaceId.trim().toLowerCase();
  if (!trimmed) return null;

  const { subscriptionPlan, billingManaged } = useStore.getState();

  let shared: Awaited<ReturnType<typeof fetchSharedWorkspaceDoc>> = null;
  try {
    shared = await fetchSharedWorkspaceDoc(trimmed);
  } catch {
    shared = null;
  }

  let memberCount: number | null = null;
  try {
    memberCount = Math.max(await countWorkspaceMembers(trimmed), 1);
  } catch {
    memberCount = null;
  }
  const filled = memberCount ?? 1;

  if (
    shared?.enterpriseSubscriptionPlan === "enterprise" &&
    shared.enterpriseBillingManaged === true
  ) {
    const seats = Number(shared.enterpriseSeatCount || 0);
    if (seats <= 0) return { filled, capacity: Math.max(filled, 1) };
    if (memberCount == null) return null;
    return { filled: memberCount, capacity: seats };
  }

  if (billingManaged && subscriptionPlan === "pro") {
    try {
      const pass = await billingApi.ensureSeatPass();
      const seats = Number(pass.seatCount || 0);
      if (seats <= 0) return { filled, capacity: Math.max(filled, 1) };
      const passWorkspace = pass.workspace?.id?.trim().toLowerCase() ?? "";
      if (passWorkspace && passWorkspace !== trimmed) {
        return { filled, capacity: Math.max(filled, 1) };
      }
      const occupied =
        memberCount ?? Math.max(seats - Number(pass.remainingUses || 0), 1);
      return { filled: occupied, capacity: seats };
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("paiement") || message.includes("payment") || message.includes("actif")) {
        return { filled, capacity: Math.max(filled, 1) };
      }
      return null;
    }
  }

  return { filled, capacity: Math.max(filled, 1) };
}

/**
 * true = a paid seat is free for one more member.
 * false = the workspace is full.
 * null = the seat count could not be read, so the invite can continue.
 */
export async function workspaceHasOpenInviteSeat(workspaceId: string): Promise<boolean | null> {
  const counts = await loadWorkspaceSeatCounts(workspaceId);
  if (!counts) return null;
  return counts.filled < counts.capacity;
}
