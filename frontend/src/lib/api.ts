import type { AgentImagePayload } from "./agentImages";
import { getAuthIdToken } from "./firebase/authToken";
import { callAiChat } from "./firebase/aiChat";
import { notifyAiUsageUpdated } from "./usageEvents";
import type {
  AgentResponse,
  AnalysisResponse,
  CadDocument,
  ChatResponse,
  ImportResponse,
  PartMeshImportResponse,
  RebuildResult,
} from "./types";

const BASE = "/api";

async function authHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = await getAuthIdToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseApiError(response: Response): Promise<string> {
  const text = (await response.text()).trim();
  if (!text) return `HTTP ${response.status}`;
  try {
    const payload = JSON.parse(text) as { detail?: unknown; message?: unknown };
    if (typeof payload.detail === "string") return payload.detail;
    if (Array.isArray(payload.detail)) {
      const parts = payload.detail
        .map((entry) => {
          if (typeof entry === "string") return entry;
          if (entry && typeof entry === "object" && "msg" in entry) {
            return String((entry as { msg?: unknown }).msg ?? "");
          }
          return "";
        })
        .filter(Boolean);
      if (parts.length > 0) return parts.join(" ");
    }
    if (typeof payload.message === "string") return payload.message;
  } catch {
    // Plain-text error body from FastAPI HTTPException.
  }
  return text;
}

async function jsonPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
    signal,
  });
  if (!r.ok) throw new Error(await parseApiError(r));
  return r.json() as Promise<T>;
}

async function jsonGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    headers: await authHeaders(),
    signal,
  });
  if (!r.ok) throw new Error(await parseApiError(r));
  return r.json() as Promise<T>;
}

async function chatViaCloudOrBackend(
  prompt: string,
  aiModel: string,
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
  chatInstructions?: string,
  workspaceId?: string,
): Promise<ChatResponse> {
  const token = await getAuthIdToken();
  const payload = {
    prompt,
    ai_model: aiModel,
    messages,
    ...(chatInstructions?.trim() ? { chat_instructions: chatInstructions.trim() } : {}),
    ...(workspaceId?.trim() ? { workspace_id: workspaceId.trim().toLowerCase() } : {}),
  };
  if (token) {
    try {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const response = await callAiChat(payload);
      if (!["quota", "free_plan", "rules"].includes(response.source ?? "")) {
        notifyAiUsageUpdated();
      }
      return response;
    } catch (err) {
      if (signal?.aborted) throw err;
      // Local desktop dev: fallback to FastAPI when Cloud Functions are unavailable.
      if (import.meta.env.DEV) {
        const response = await jsonPost<ChatResponse>("/chat", payload, signal);
        if (!["quota", "free_plan", "rules"].includes(response.source ?? "")) {
          notifyAiUsageUpdated();
        }
        return response;
      }
      throw err;
    }
  }
  const response = await jsonPost<ChatResponse>("/chat", payload, signal);
  if (!["quota", "free_plan", "rules"].includes(response.source ?? "")) {
    notifyAiUsageUpdated();
  }
  return response;
}

export interface UserLookupResponse {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
}

export const api = {
  async health(signal?: AbortSignal) {
    const r = await fetch(`${BASE}/health`, { signal });
    if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
    return r.json();
  },

  lookupUserByEmail(email: string) {
    return jsonGet<UserLookupResponse>(`/users/lookup?email=${encodeURIComponent(email)}`);
  },

  rebuild(document: CadDocument, material: string) {
    return jsonPost<RebuildResult>("/rebuild", { document, material });
  },

  agent(
    document: CadDocument,
    prompt: string,
    material: string,
    aiModel: string,
    workMode: string,
    signal?: AbortSignal,
    images: AgentImagePayload[] = [],
    workspaceId?: string,
  ) {
    return jsonPost<AgentResponse>(
      "/agent",
      {
        document,
        prompt,
        material,
        ai_model: aiModel,
        work_mode: workMode,
        images,
        ...(workspaceId?.trim() ? { workspace_id: workspaceId.trim().toLowerCase() } : {}),
      },
      signal,
    );
  },

  textToCad(
    prompt: string,
    material: string,
    aiModel: string,
    workMode: string,
    signal?: AbortSignal,
    workspaceId?: string,
  ) {
    return jsonPost<AgentResponse>(
      "/text-to-cad",
      {
        prompt,
        material,
        ai_model: aiModel,
        work_mode: workMode,
        ...(workspaceId?.trim() ? { workspace_id: workspaceId.trim().toLowerCase() } : {}),
      },
      signal,
    );
  },

  chat(
    prompt: string,
    aiModel: string,
    messages: { role: string; content: string }[],
    signal?: AbortSignal,
    chatInstructions?: string,
    workspaceId?: string,
  ) {
    return chatViaCloudOrBackend(
      prompt,
      aiModel,
      messages,
      signal,
      chatInstructions,
      workspaceId,
    );
  },

  analyze(document: CadDocument, material: string, load_n: number, min_wall_mm: number) {
    return jsonPost<AnalysisResponse>("/analyze", {
      document,
      material,
      load_n,
      min_wall_mm,
    });
  },

  async importPartMesh(file: File, material: string): Promise<PartMeshImportResponse> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("material", material);
    const headers: Record<string, string> = {};
    const token = await getAuthIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(`${BASE}/import-mesh`, { method: "POST", body: fd, headers });
    if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
    return r.json();
  },

  async recap(input: {
    file: Blob;
    filename: string;
    title: string;
    durationMs: number;
    signal?: AbortSignal;
  }): Promise<{ title: string; body_html: string; transcript?: string }> {
    const fd = new FormData();
    fd.append("file", input.file, input.filename);
    fd.append("title", input.title);
    fd.append("duration_ms", String(input.durationMs));
    const headers: Record<string, string> = {};
    const token = await getAuthIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(`${BASE}/recap`, {
      method: "POST",
      body: fd,
      headers,
      signal: input.signal,
    });
    if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
    return r.json();
  },

  async createHandoff(body: {
    kind: "ai-segment" | "manual-note";
    targetType: "dm" | "group";
    recipientUid?: string;
    groupId?: string;
    messageIndices?: number[];
    messages?: { role: string; text: string }[];
    noteTitle?: string;
    noteBodyHtml?: string;
    sourceSessionId?: string;
    title?: string;
  }): Promise<{ handoffId: string; inboxText: string; title: string; preview: string }> {
    return jsonPost("/handoffs", body);
  },

  async importDrawing(
    file: File,
    realWidthMm: number | null,
    thicknessMm: number,
    material: string
  ): Promise<ImportResponse> {
    const fd = new FormData();
    fd.append("file", file);
    if (realWidthMm != null) fd.append("real_width_mm", String(realWidthMm));
    fd.append("thickness_mm", String(thicknessMm));
    fd.append("material", material);
    const headers: Record<string, string> = {};
    const token = await getAuthIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(`${BASE}/import`, { method: "POST", body: fd, headers });
    if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
    return r.json();
  },

  async export(document: CadDocument, fmt: string): Promise<Blob> {
    const r = await fetch(`${BASE}/export?fmt=${fmt}`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify(document),
    });
    if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
    return r.blob();
  },

  async examples(): Promise<{ prompt: string; document: CadDocument }[]> {
    const r = await fetch(`${BASE}/examples`);
    if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
    return r.json();
  },
};
