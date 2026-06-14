import type { AiModel } from "./aiModels";
import { useNotificationsStore } from "../store/useNotificationsStore";

export interface AiModelFallbackResponse {
  ai_model_fallback?: boolean;
  effective_ai_model?: string;
}

export const AI_QUOTA_FALLBACK_NOTICE =
  "Limite API atteinte — passage en mode Auto. Passez à l'abonnement Pro pour retrouver les modèles premium ; l'usage à la demande peut être ajouté en complément.";

export function handleAiModelFallback(
  res: AiModelFallbackResponse,
  setAiModel: (model: AiModel) => void,
) {
  if (!res.ai_model_fallback || res.effective_ai_model !== "auto") return;

  setAiModel("auto");
  useNotificationsStore.getState().push({
    kind: "subscription",
    title: "Limite API atteinte",
    body: AI_QUOTA_FALLBACK_NOTICE,
  });
}
