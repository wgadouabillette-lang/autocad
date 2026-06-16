import { useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../../store/useStore";
import type { Mesh as CadMesh } from "../../lib/types";
import {
  buildFaceReference,
  buildTriangleAdjacency,
  classifyNormalCad,
  pickPlanarFacePatch,
  triangleNormal,
} from "../../lib/faceReference";
import { useThemePalette } from "../../hooks/useThemePalette";

interface Props {
  mesh: CadMesh;
  material: string;
}

export default function PickableSolid({ mesh, material }: Props) {
  const theme = useThemePalette();
  const meshRef = useRef<THREE.Mesh>(null);
  const selectFace = useStore((s) => s.selectFace);
  const selectedFaces = useStore((s) => s.selectedFaces);
  const highlight = useMemo(() => new THREE.Color(theme.highlight), [theme.highlight]);

  const adjacency = useMemo(() => buildTriangleAdjacency(mesh), [mesh]);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
    if (mesh.normals.length === mesh.positions.length) {
      g.setAttribute("normal", new THREE.Float32BufferAttribute(mesh.normals, 3));
    }
    g.setIndex(mesh.indices);
    if (mesh.normals.length !== mesh.positions.length) g.computeVertexNormals();

    return g;
  }, [mesh]);

  const edgesGeometry = useMemo(() => {
    const eg = new THREE.EdgesGeometry(geometry, 25);
    const positions = eg.attributes.position as THREE.BufferAttribute;
    const distances = new Float32Array(positions.count);
    for (let i = 0; i < positions.count; i += 2) {
      const dx = positions.getX(i + 1) - positions.getX(i);
      const dy = positions.getY(i + 1) - positions.getY(i);
      const dz = positions.getZ(i + 1) - positions.getZ(i);
      distances[i] = 0;
      distances[i + 1] = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    eg.setAttribute("lineDistance", new THREE.BufferAttribute(distances, 1));
    return eg;
  }, [geometry]);

  /**
   * Arêtes candidates aux silhouettes : arêtes lisses (angle entre faces
   * voisines < 15°) sur surfaces courbes (cylindres, etc.). Ces arêtes ne sont
   * pas dans EdgesGeometry. On les évalue par frame pour ne dessiner que celles
   * qui forment la silhouette vue de la caméra (transition front↔back).
   */
  const silhouetteCandidates = useMemo(() => {
    const triCount = mesh.indices.length / 3;
    const edgeMap = new Map<string, { tri: number; va: number; vb: number }[]>();
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
      list.push({ tri, va: a, vb: b });
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

    const SMOOTH_DOT = Math.cos((25 * Math.PI) / 180);
    const cands: {
      v0: number;
      v1: number;
      length: number;
      n0x: number;
      n0y: number;
      n0z: number;
      n1x: number;
      n1y: number;
      n1z: number;
      c0x: number;
      c0y: number;
      c0z: number;
      c1x: number;
      c1y: number;
      c1z: number;
    }[] = [];

    const triCentroid = (tri: number): [number, number, number] => {
      const base = tri * 3;
      const i0 = mesh.indices[base];
      const i1 = mesh.indices[base + 1];
      const i2 = mesh.indices[base + 2];
      return [
        (mesh.positions[i0 * 3] + mesh.positions[i1 * 3] + mesh.positions[i2 * 3]) / 3,
        (mesh.positions[i0 * 3 + 1] + mesh.positions[i1 * 3 + 1] + mesh.positions[i2 * 3 + 1]) / 3,
        (mesh.positions[i0 * 3 + 2] + mesh.positions[i1 * 3 + 2] + mesh.positions[i2 * 3 + 2]) / 3,
      ];
    };
    const triNorm = (tri: number) => {
      const base = tri * 3;
      return triangleNormal(
        mesh.positions,
        mesh.indices[base],
        mesh.indices[base + 1],
        mesh.indices[base + 2],
      );
    };

    for (const list of edgeMap.values()) {
      if (list.length !== 2) continue;
      const [e0, e1] = list;
      const n0 = triNorm(e0.tri);
      const n1 = triNorm(e1.tri);
      const dot = n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2];
      if (dot < SMOOTH_DOT) continue; // arête vive : déjà dessinée par EdgesGeometry

      const c0 = triCentroid(e0.tri);
      const c1 = triCentroid(e1.tri);
      const dx = mesh.positions[e0.vb * 3] - mesh.positions[e0.va * 3];
      const dy = mesh.positions[e0.vb * 3 + 1] - mesh.positions[e0.va * 3 + 1];
      const dz = mesh.positions[e0.vb * 3 + 2] - mesh.positions[e0.va * 3 + 2];
      const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

      cands.push({
        v0: e0.va,
        v1: e0.vb,
        length,
        n0x: n0[0],
        n0y: n0[1],
        n0z: n0[2],
        n1x: n1[0],
        n1y: n1[1],
        n1z: n1[2],
        c0x: c0[0],
        c0y: c0[1],
        c0z: c0[2],
        c1x: c1[0],
        c1y: c1[1],
        c1z: c1[2],
      });
    }
    return cands;
  }, [mesh]);

  const silhouetteGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(Math.max(1, silhouetteCandidates.length) * 6);
    const dist = new Float32Array(Math.max(1, silhouetteCandidates.length) * 2);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("lineDistance", new THREE.BufferAttribute(dist, 1));
    g.setDrawRange(0, 0);
    return g;
  }, [silhouetteCandidates]);

  const camLocalRef = useRef(new THREE.Vector3());
  useFrame(({ camera }) => {
    if (!meshRef.current || silhouetteCandidates.length === 0) return;
    const camLocal = camLocalRef.current.copy(camera.position);
    meshRef.current.worldToLocal(camLocal);

    const posArr = silhouetteGeometry.attributes.position.array as Float32Array;
    const distArr = silhouetteGeometry.attributes.lineDistance.array as Float32Array;
    let seg = 0;
    for (const c of silhouetteCandidates) {
      const d0 =
        (camLocal.x - c.c0x) * c.n0x +
        (camLocal.y - c.c0y) * c.n0y +
        (camLocal.z - c.c0z) * c.n0z;
      const d1 =
        (camLocal.x - c.c1x) * c.n1x +
        (camLocal.y - c.c1y) * c.n1y +
        (camLocal.z - c.c1z) * c.n1z;
      if (d0 >= 0 === d1 >= 0) continue;

      const p = seg * 6;
      posArr[p + 0] = mesh.positions[c.v0 * 3];
      posArr[p + 1] = mesh.positions[c.v0 * 3 + 1];
      posArr[p + 2] = mesh.positions[c.v0 * 3 + 2];
      posArr[p + 3] = mesh.positions[c.v1 * 3];
      posArr[p + 4] = mesh.positions[c.v1 * 3 + 1];
      posArr[p + 5] = mesh.positions[c.v1 * 3 + 2];
      distArr[seg * 2 + 0] = 0;
      distArr[seg * 2 + 1] = c.length;
      seg++;
    }

    silhouetteGeometry.attributes.position.needsUpdate = true;
    silhouetteGeometry.attributes.lineDistance.needsUpdate = true;
    silhouetteGeometry.setDrawRange(0, seg * 2);
    silhouetteGeometry.computeBoundingSphere();
  });

  const selectedGeometry = useMemo(() => {
    const tris = selectedFaces.flatMap((f) => f.triangleIndices);
    if (!tris.length) return null;

    const positions: number[] = [];
    const indices: number[] = [];
    for (const tri of tris) {
      const base = tri * 3;
      const i0 = mesh.indices[base];
      const i1 = mesh.indices[base + 1];
      const i2 = mesh.indices[base + 2];
      const [nx, ny, nz] = triangleNormal(mesh.positions, i0, i1, i2);
      const offset = 0.04;
      for (const vi of [i0, i1, i2]) {
        positions.push(
          mesh.positions[vi * 3] + nx * offset,
          mesh.positions[vi * 3 + 1] + ny * offset,
          mesh.positions[vi * 3 + 2] + nz * offset,
        );
      }
      const outBase = positions.length / 3 - 3;
      indices.push(outBase, outBase + 1, outBase + 2);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [mesh, selectedFaces]);

  const onFacePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const faceIndex = e.faceIndex;
    if (faceIndex == null || !meshRef.current) return;

    const patch = pickPlanarFacePatch(mesh, faceIndex, adjacency);
    const base = faceIndex * 3;
    const i0 = mesh.indices[base];
    const i1 = mesh.indices[base + 1];
    const i2 = mesh.indices[base + 2];
    const [nx, ny, nz] = triangleNormal(mesh.positions, i0, i1, i2);
    const region = classifyNormalCad(nx, ny, nz);

    const ref = buildFaceReference(
      region,
      patch.centroid,
      patch.normal,
      patch.triangleIndices,
    );

    const additive = e.nativeEvent.metaKey || e.nativeEvent.ctrlKey;
    selectFace(ref, { additive });
  };

  return (
    <group>
      <mesh
        ref={meshRef}
        geometry={geometry}
        onPointerDown={onFacePointerDown}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      >
        <meshBasicMaterial
          color={theme.gridMajor}
          transparent
          opacity={0.9}
          side={THREE.FrontSide}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>

      <lineSegments geometry={edgesGeometry} renderOrder={1}>
        <lineBasicMaterial color={theme.edgeLabel} />
      </lineSegments>

      <lineSegments geometry={edgesGeometry} renderOrder={2}>
        <lineDashedMaterial
          color={theme.edgeLabel}
          transparent
          opacity={0.8}
          dashSize={1.5}
          gapSize={1}
          depthFunc={THREE.GreaterDepth}
        />
      </lineSegments>

      <lineSegments geometry={silhouetteGeometry} renderOrder={3}>
        <lineDashedMaterial
          color={theme.edgeLabel}
          transparent
          opacity={0.8}
          dashSize={1.5}
          gapSize={1}
          depthTest={false}
        />
      </lineSegments>
      {selectedGeometry && (
        <mesh geometry={selectedGeometry} raycast={() => null}>
          <meshStandardMaterial
            color={highlight}
            metalness={0.1}
            roughness={0.35}
            transparent
            opacity={0.92}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-2}
            side={THREE.FrontSide}
          />
        </mesh>
      )}
    </group>
  );
}
