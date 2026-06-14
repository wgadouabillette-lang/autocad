import type { Mesh as CadMesh } from "./types";

/** Régions canoniques selon la normale (repère CAO : Z = hauteur). */
export type FaceRegion =
  | "top"
  | "bottom"
  | "pos_x"
  | "neg_x"
  | "pos_y"
  | "neg_y"
  | "oblique";

/** Mentions @ insérées dans le champ (sans espaces, comme @Modelling). */
export const FACE_MENTION_BY_REGION: Record<FaceRegion, string> = {
  top: "Face+Z",
  bottom: "Face-Z",
  pos_x: "Face+X",
  neg_x: "Face-X",
  pos_y: "Face+Y",
  neg_y: "Face-Y",
  oblique: "FaceOblique",
};

const FACE_MENTION_LIST = Object.values(FACE_MENTION_BY_REGION)
  .map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

export const FACE_MENTION_PATTERN = new RegExp(`@(?:${FACE_MENTION_LIST})(?=\\s|$)`, "gi");

export interface FaceReference {
  region: FaceRegion;
  /** Token @ dans le champ (ex. Face+X). */
  mention: string;
  label: string;
  normal: [number, number, number];
  centroid: [number, number, number];
  /** Triangles du patch planaire cliqué (sélection locale, pas toute la zone ±X/±Y/±Z). */
  triangleIndices: number[];
}

export function faceReferenceSnippet(face: FaceReference): string {
  return `@${face.mention} `;
}

export function selectedFacesReferenceSnippet(faces: FaceReference[]): string {
  return faces.map((f) => faceReferenceSnippet(f)).join("");
}

export function faceInSelection(faces: FaceReference[], ref: FaceReference): boolean {
  return faces.some((f) => sameFaceReference(f, ref));
}

function countFaceMentionInText(text: string, mention: string): number {
  const re = new RegExp(`@${mention.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "gi");
  return [...text.matchAll(re)].length;
}

/** Vérifie que le texte contient encore assez de @mentions pour chaque face sélectionnée. */
export function selectedFacesStillInText(text: string, faces: FaceReference[]): boolean {
  if (faces.length === 0) return true;
  const needed = new Map<string, number>();
  for (const f of faces) {
    needed.set(f.mention, (needed.get(f.mention) ?? 0) + 1);
  }
  for (const [mention, count] of needed) {
    if (countFaceMentionInText(text, mention) < count) return false;
  }
  return true;
}

const LEGACY_FACE_REF_PATTERN = /\[Réf\. face:[^\]]+\]\s*/g;

export function stripFaceReferenceFromText(text: string): string {
  return text
    .replace(LEGACY_FACE_REF_PATTERN, "")
    .replace(FACE_MENTION_PATTERN, "")
    .replace(/^\s+/, "");
}

export function sameFaceReference(a: FaceReference, b: FaceReference): boolean {
  if (a.triangleIndices.length !== b.triangleIndices.length) return false;
  return a.triangleIndices[0] === b.triangleIndices[0];
}

const REGION_LABELS: Record<FaceRegion, string> = {
  top: "Top face (+Z)",
  bottom: "Bottom face (-Z)",
  pos_x: "+X face (right)",
  neg_x: "-X face (left)",
  pos_y: "+Y face (front)",
  neg_y: "-Y face (back)",
  oblique: "Oblique face (chamfer / fillet)",
};

export function faceRegionLabel(region: FaceRegion): string {
  return REGION_LABELS[region];
}

/** Classe une normale unitaire en repère CAO. */
export function classifyNormalCad(nx: number, ny: number, nz: number): FaceRegion {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  const m = Math.max(ax, ay, az);
  if (m < 0.65) return "oblique";
  if (az === m) return nz > 0 ? "top" : "bottom";
  if (ax === m) return nx > 0 ? "pos_x" : "neg_x";
  return ny > 0 ? "pos_y" : "neg_y";
}

export function triangleNormal(
  positions: Float32Array | number[],
  i0: number,
  i1: number,
  i2: number,
): [number, number, number] {
  const ax = positions[i1 * 3] - positions[i0 * 3];
  const ay = positions[i1 * 3 + 1] - positions[i0 * 3 + 1];
  const az = positions[i1 * 3 + 2] - positions[i0 * 3 + 2];
  const bx = positions[i2 * 3] - positions[i0 * 3];
  const by = positions[i2 * 3 + 1] - positions[i0 * 3 + 1];
  const bz = positions[i2 * 3 + 2] - positions[i0 * 3 + 2];
  let nx = ay * bz - az * by;
  let ny = az * bx - ax * bz;
  let nz = ax * by - ay * bx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  return [nx, ny, nz];
}

const NORMAL_DOT_MIN = 0.992;
const PLANE_DIST_MM = 0.35;

/** Adjacence triangle ↔ triangle (arête partagée). */
export function buildTriangleAdjacency(mesh: CadMesh): number[][] {
  const triCount = mesh.indices.length / 3;
  const adj: number[][] = Array.from({ length: triCount }, () => []);
  const edgeMap = new Map<string, number[]>();
  const vertexKey = (vi: number) => {
    const x = mesh.positions[vi * 3].toFixed(4);
    const y = mesh.positions[vi * 3 + 1].toFixed(4);
    const z = mesh.positions[vi * 3 + 2].toFixed(4);
    return `${x},${y},${z}`;
  };

  const addEdge = (a: number, b: number, tri: number) => {
    const ka = vertexKey(a);
    const kb = vertexKey(b);
    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    let list = edgeMap.get(key);
    if (!list) {
      list = [];
      edgeMap.set(key, list);
    }
    list.push(tri);
  };

  for (let tri = 0; tri < triCount; tri++) {
    const base = tri * 3;
    const a = mesh.indices[base];
    const b = mesh.indices[base + 1];
    const c = mesh.indices[base + 2];
    addEdge(a, b, tri);
    addEdge(b, c, tri);
    addEdge(c, a, tri);
  }

  for (const tris of edgeMap.values()) {
    for (let i = 0; i < tris.length; i++) {
      for (let j = i + 1; j < tris.length; j++) {
        adj[tris[i]].push(tris[j]);
        adj[tris[j]].push(tris[i]);
      }
    }
  }
  return adj;
}

function vertexPlaneDistance(
  positions: Float32Array | number[],
  vi: number,
  normal: [number, number, number],
  planeD: number,
): number {
  const px = positions[vi * 3];
  const py = positions[vi * 3 + 1];
  const pz = positions[vi * 3 + 2];
  return Math.abs(px * normal[0] + py * normal[1] + pz * normal[2] - planeD);
}

/** Seuil d'angle pour considérer deux triangles voisins comme "lisses" (CAO : arête vive au-delà). */
const SMOOTH_FACE_DOT = Math.cos((25 * Math.PI) / 180);

/**
 * Regroupe les triangles formant une face — plane ou courbe — à partir du
 * triangle cliqué. Les frontières sont les arêtes vives (angle entre faces
 * voisines > ~25°). Permet de sélectionner un cylindre entier comme un seul
 * "rectangle courbé" tout en restant strict sur les faces planes adjacentes.
 */
export function pickPlanarFacePatch(
  mesh: CadMesh,
  triIndex: number,
  adjacency: number[][],
): { triangleIndices: number[]; normal: [number, number, number]; centroid: [number, number, number] } {
  const pos = mesh.positions;
  const idx = mesh.indices;
  const base = triIndex * 3;
  const i0 = idx[base];
  const i1 = idx[base + 1];
  const i2 = idx[base + 2];
  const seedNormal = triangleNormal(pos, i0, i1, i2);
  const seedCentroid: [number, number, number] = [
    (pos[i0 * 3] + pos[i1 * 3] + pos[i2 * 3]) / 3,
    (pos[i0 * 3 + 1] + pos[i1 * 3 + 1] + pos[i2 * 3 + 1]) / 3,
    (pos[i0 * 3 + 2] + pos[i1 * 3 + 2] + pos[i2 * 3 + 2]) / 3,
  ];

  // Détection : zone plate (toutes les normales voisines ≈ seed) vs courbe.
  let isFlat = true;
  for (const nb of adjacency[triIndex]) {
    const nbBase = nb * 3;
    const n = triangleNormal(pos, idx[nbBase], idx[nbBase + 1], idx[nbBase + 2]);
    const dot = n[0] * seedNormal[0] + n[1] * seedNormal[1] + n[2] * seedNormal[2];
    if (dot < NORMAL_DOT_MIN) {
      isFlat = false;
      break;
    }
  }

  const visited = new Set<number>([triIndex]);
  const queue: number[] = [triIndex];

  if (isFlat) {
    const planeD = seedNormal[0] * seedCentroid[0] + seedNormal[1] * seedCentroid[1] + seedNormal[2] * seedCentroid[2];
    while (queue.length > 0) {
      const tri = queue.shift()!;
      for (const nb of adjacency[tri]) {
        if (visited.has(nb)) continue;
        const nbBase = nb * 3;
        const j0 = idx[nbBase];
        const j1 = idx[nbBase + 1];
        const j2 = idx[nbBase + 2];
        const n = triangleNormal(pos, j0, j1, j2);
        const dot = n[0] * seedNormal[0] + n[1] * seedNormal[1] + n[2] * seedNormal[2];
        if (dot < NORMAL_DOT_MIN) continue;
        let coplanar = true;
        for (const vi of [j0, j1, j2]) {
          if (vertexPlaneDistance(pos, vi, seedNormal, planeD) > PLANE_DIST_MM) {
            coplanar = false;
            break;
          }
        }
        if (!coplanar) continue;
        visited.add(nb);
        queue.push(nb);
      }
    }
  } else {
    // Croissance "lisse" : on traverse les arêtes douces (angle voisin↔voisin < 25°),
    // on s'arrête sur les arêtes vives. Sélectionne tout un cylindre, un cône, etc.
    const normalCache = new Map<number, [number, number, number]>();
    normalCache.set(triIndex, seedNormal);
    while (queue.length > 0) {
      const tri = queue.shift()!;
      const triN = normalCache.get(tri)!;
      for (const nb of adjacency[tri]) {
        if (visited.has(nb)) continue;
        const nbBase = nb * 3;
        const j0 = idx[nbBase];
        const j1 = idx[nbBase + 1];
        const j2 = idx[nbBase + 2];
        const n = triangleNormal(pos, j0, j1, j2);
        const dot = n[0] * triN[0] + n[1] * triN[1] + n[2] * triN[2];
        if (dot < SMOOTH_FACE_DOT) continue;
        visited.add(nb);
        normalCache.set(nb, n);
        queue.push(nb);
      }
    }
  }

  return {
    triangleIndices: [...visited],
    normal: seedNormal,
    centroid: seedCentroid,
  };
}

export function computeFaceRegions(mesh: CadMesh): Record<FaceRegion, number[]> {
  const regions: Record<FaceRegion, number[]> = {
    top: [],
    bottom: [],
    pos_x: [],
    neg_x: [],
    pos_y: [],
    neg_y: [],
    oblique: [],
  };
  const pos = mesh.positions;
  const idx = mesh.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const tri = t / 3;
    const [nx, ny, nz] = triangleNormal(pos, idx[t], idx[t + 1], idx[t + 2]);
    const region = classifyNormalCad(nx, ny, nz);
    regions[region].push(tri);
  }
  return regions;
}

export function buildFaceReference(
  region: FaceRegion,
  centroid: [number, number, number],
  normal: [number, number, number],
  triangleIndices: number[],
): FaceReference {
  return {
    region,
    mention: FACE_MENTION_BY_REGION[region],
    label: faceRegionLabel(region),
    normal,
    centroid,
    triangleIndices,
  };
}

function facesConstraintHeader(count: number): string {
  const zones =
    count > 1
      ? `the ${count} faces/zones selected below`
      : "the face/zone selected below";
  return (
    `[FACE CONSTRAINT — LOCAL MODIFICATIONS ONLY]\n` +
    `The user selected ${zones} on the 3D model.\n` +
    `MANDATORY RULES:\n` +
    `- Apply ONLY the requested modifications on these zone(s).\n` +
    `- Do NOT modify the rest of the part: no other faces, no global size or shape changes.\n` +
    `- Do not add features outside these zones unless strictly necessary for the requested local change.\n\n`
  );
}

function faceReferenceBlock(face: FaceReference, index: number, total: number): string {
  const [nx, ny, nz] = face.normal;
  const [cx, cy, cz] = face.centroid;
  const header =
    total > 1
      ? `[REFERENCE FACE ${index + 1}/${total}]\n`
      : `[REFERENCE FACE]\n`;
  return (
    header +
    `Zone: ${face.label}\n` +
    `Normal (mm): (${nx.toFixed(3)}, ${ny.toFixed(3)}, ${nz.toFixed(3)})\n` +
    `Reference point (mm): (${cx.toFixed(2)}, ${cy.toFixed(2)}, ${cz.toFixed(2)})\n\n`
  );
}

/** Détails complets envoyés à l'agent quand des faces sont sélectionnées dans la vue 3D. */
export function augmentPromptWithFaces(prompt: string, faces: FaceReference[]): string {
  if (faces.length === 0) return prompt;
  const body = stripFaceReferenceFromText(prompt).trim();
  const blocks = faces.map((f, i) => faceReferenceBlock(f, i, faces.length)).join("");
  return facesConstraintHeader(faces.length) + blocks + (body ? `${body}\n\n` : "");
}

/** @deprecated Utiliser augmentPromptWithFaces */
export function augmentPromptWithFace(prompt: string, face: FaceReference | null): string {
  return augmentPromptWithFaces(prompt, face ? [face] : []);
}
