export interface Feature {
  id: string;
  type: string;
  name: string;
  suppressed: boolean;
  params: Record<string, any>;
}

export interface CadDocument {
  name: string;
  units: string;
  features: Feature[];
  meta: Record<string, any>;
}

export interface Mesh {
  positions: number[];
  normals: number[];
  indices: number[];
}

export interface BBox {
  min: number[];
  max: number[];
}

export interface MassProps {
  volume_mm3: number;
  area_mm2: number;
  mass_g: number;
  material: string;
  center_of_mass: number[];
  watertight: boolean;
}

export interface RebuildResult {
  ok: boolean;
  mesh: Mesh;
  bbox: BBox;
  mass: MassProps;
  errors: string[];
  warnings: string[];
}

export interface AgentAction {
  kind: string;
  description: string;
  feature_ids: string[];
}

export interface ChatResponse {
  message: string;
  source: string;
  ai_model_fallback?: boolean;
  effective_ai_model?: string;
}

export interface AgentResponse {
  document: CadDocument;
  message: string;
  actions: AgentAction[];
  rebuild: RebuildResult;
  source: string;
  ai_model_fallback?: boolean;
  effective_ai_model?: string;
}

export interface AnalysisIssue {
  severity: "info" | "warning" | "error";
  message: string;
  suggestion: string;
}

export interface AnalysisResponse {
  printability_score: number;
  issues: AnalysisIssue[];
  mass: MassProps;
  stress_estimate_mpa: number | null;
  safety_factor: number | null;
  summary: string;
}

export interface VisionReport {
  width_px: number;
  height_px: number;
  scale_mm_per_px: number;
  profile_points: number;
  holes: number;
  detected_size_mm: number[];
  notes: string[];
  preview_png_b64: string;
}

export interface ImportResponse {
  document: CadDocument;
  report: VisionReport;
  rebuild: RebuildResult;
  message: string;
}

export interface PartMeshImportResponse {
  document: CadDocument;
  rebuild: RebuildResult;
  message: string;
}

export const MATERIALS = [
  "aluminium",
  "acier",
  "inox",
  "titane",
  "laiton",
  "pla",
  "abs",
  "petg",
  "nylon",
];
