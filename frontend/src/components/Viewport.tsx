import { Canvas } from "@react-three/fiber";
import { Bounds, GizmoHelper, GizmoViewport, OrbitControls } from "@react-three/drei";
import { useStore } from "../store/useStore";
import { THEME } from "../lib/theme";
import PickableSolid from "./viewport/PickableSolid";

export default function Viewport() {
  const rebuild = useStore((s) => s.rebuild);
  const material = useStore((s) => s.material);
  const document = useStore((s) => s.document);
  const clearSelectedFaces = useStore((s) => s.clearSelectedFaces);

  const hasMesh = rebuild && rebuild.mesh.positions.length > 0;
  const fitKey = `${document.features.length}-${rebuild?.bbox.max.join(",")}-${rebuild?.bbox.min.join(",")}`;

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [180, 140, 180], fov: 40, up: [0, 1, 0], near: 1, far: 5000 }}
        gl={{ antialias: true }}
        onPointerMissed={() => clearSelectedFaces()}
      >
        <color attach="background" args={[THEME.bg]} />
        <ambientLight intensity={1} />

        {/* Repere CAD : Z vers le haut -> on bascule le groupe pour l'affichage Y-up */}
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {hasMesh && (
            <Bounds key={fitKey} fit clip margin={1.3}>
              <PickableSolid mesh={rebuild!.mesh} material={material} />
            </Bounds>
          )}
        </group>

        <OrbitControls makeDefault enableDamping dampingFactor={0.08} />

        <GizmoHelper alignment="top-right" margin={[48, 48]}>
          <GizmoViewport
            scale={22}
            axisHeadScale={0.85}
            axisColors={["#e57373", "#81c784", "#64b5f6"]}
            labelColor={THEME.edgeLabel}
            hideNegativeAxes={false}
          />
        </GizmoHelper>
      </Canvas>

      {!hasMesh && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-center text-muted-400">
            <div className="text-5xl mb-3">◳</div>
            <p className="text-sm">No model.</p>
            <p className="text-xs mt-1">Generate a part or import a drawing to get started.</p>
          </div>
        </div>
      )}
    </div>
  );
}
