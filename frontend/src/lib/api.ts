import type { AgentImagePayload } from "./agentImages";
import { getAuthIdToken } from "./firebase/authToken";
import { callAiChat } from "./firebase/aiChat";
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

async function jsonPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
    signal,
  });
  if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

async function jsonGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    headers: await authHeaders(),
    signal,
  });
  if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

async function chatViaCloudOrBackend(
  prompt: string,
  aiModel: string,
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
  chatInstructions?: string,
): Promise<ChatResponse> {
  const token = await getAuthIdToken();
  const payload = {
    prompt,
    ai_model: aiModel,
    messages,
    ...(chatInstructions?.trim() ? { chat_instructions: chatInstructions.trim() } : {}),
  };
  if (token) {
    try {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return await callAiChat(payload);
    } catch (err) {
      if (signal?.aborted) throw err;
      // Local desktop dev: fallback to FastAPI when Cloud Functions are unavailable.
      if (import.meta.env.DEV) {
        return jsonPost<ChatResponse>("/chat", payload, signal);
      }
      throw err;
    }
  }
  return jsonPost<ChatResponse>("/chat", payload, signal);
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
      },
      signal,
    );
  },

  textToCad(prompt: string, material: string, aiModel: string, workMode: string, signal?: AbortSignal) {
    return jsonPost<AgentResponse>(
      "/text-to-cad",
      {
        prompt,
        material,
        ai_model: aiModel,
        work_mode: workMode,
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
  ) {
    return chatViaCloudOrBackend(prompt, aiModel, messages, signal, chatInstructions);
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
