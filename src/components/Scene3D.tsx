import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import { useStore } from "../store";
import type { ComponentId } from "../types";
import { MATERIAL_COLOR, computeDerived } from "../physics/formulas";
import { profileVoltageAt, secondaryLadder } from "../physics/ladder";

const CORONA = new THREE.Color("#9d7bff");

/* ---------- parametric curves ---------- */
class Helix extends THREE.Curve<THREE.Vector3> {
  constructor(private r: number, private h: number, private turns: number) { super(); }
  getPoint(t: number, target = new THREE.Vector3()) {
    const a = 2 * Math.PI * this.turns * t;
    return target.set(this.r * Math.cos(a), t * this.h, this.r * Math.sin(a));
  }
}
class FlatSpiral extends THREE.Curve<THREE.Vector3> {
  constructor(private r0: number, private pitch: number, private turns: number) { super(); }
  getPoint(t: number, target = new THREE.Vector3()) {
    const a = 2 * Math.PI * this.turns * t;
    const r = this.r0 + this.pitch * this.turns * t;
    return target.set(r * Math.cos(a), 0, r * Math.sin(a));
  }
}
/** Inverse cone ("saucer") primary: each turn climbs the cone surface,
 *  moving outward by pitch·cosθ and upward by pitch·sinθ. */
class ConeSpiral extends THREE.Curve<THREE.Vector3> {
  constructor(private r0: number, private pitch: number, private turns: number, private angleDeg: number) { super(); }
  getPoint(t: number, target = new THREE.Vector3()) {
    const a = 2 * Math.PI * this.turns * t;
    const th = (this.angleDeg * Math.PI) / 180;
    const s = this.pitch * this.turns * t; // distance along the slope
    const r = this.r0 + s * Math.cos(th);
    return target.set(r * Math.cos(a), s * Math.sin(th), r * Math.sin(a));
  }
}

/* ---------- hover/select wrapper ---------- */
function usePickable(id: ComponentId) {
  const { hovered, selected, setHovered, setSelected } = useStore();
  const state = selected === id ? "selected" : hovered === id ? "hovered" : "idle";
  const handlers = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHovered(id);
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      setHovered(null);
      document.body.style.cursor = "auto";
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      setSelected(selected === id ? null : id);
    },
  };
  return { state, handlers };
}

function Glow({ state, color }: { state: string; color: string }) {
  return (
    <meshStandardMaterial
      color={color}
      metalness={0.85}
      roughness={0.32}
      emissive={state === "idle" ? "#000000" : CORONA}
      emissiveIntensity={state === "selected" ? 0.85 : state === "hovered" ? 0.35 : 0}
    />
  );
}

/* ---------- components ---------- */
function Secondary() {
  const params = useStore((s) => s.params);
  const p = params.secondary;
  const { state, handlers } = usePickable("secondary");

  // Stylized winding (capped turn count) with the distributed-ladder mode
  // voltage baked into vertex colors: copper at the grounded base, corona
  // purple at the top — the λ/4 standing wave painted on the coil itself.
  const winding = useMemo(() => {
    const turns = Math.min(p.turns, 64);
    const curve = new Helix(p.radius * 1.01, p.height, turns);
    const tube = Math.min(p.height / (turns * 2.6), p.radius * 0.05);
    const geom = new THREE.TubeGeometry(curve, turns * 24, tube, 6, false);

    const { profile } = secondaryLadder(computeDerived(params));
    const cBase = new THREE.Color(MATERIAL_COLOR[p.material]);
    const cHot = CORONA;
    const pos = geom.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const v = profileVoltageAt(profile, pos.getY(i) / p.height);
      c.copy(cBase).lerp(cHot, v * 0.85);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geom;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  return (
    <group {...handlers}>
      {/* coil form */}
      <mesh position={[0, p.height / 2, 0]}>
        <cylinderGeometry args={[p.radius, p.radius, p.height, 48]} />
        <meshStandardMaterial color="#3a3f47" metalness={0.1} roughness={0.85} />
      </mesh>
      <mesh geometry={winding}>
        <meshStandardMaterial
          vertexColors
          color="#ffffff"
          metalness={0.85}
          roughness={0.32}
          emissive={state === "idle" ? "#000000" : CORONA}
          emissiveIntensity={state === "selected" ? 0.6 : state === "hovered" ? 0.25 : 0}
        />
      </mesh>
    </group>
  );
}

function Primary() {
  const p = useStore((s) => s.params.primary);
  const sec = useStore((s) => s.params.secondary);
  const { state, handlers } = usePickable("primary");

  const geom = useMemo(() => {
    const curve =
      p.type === "spiral"
        ? new FlatSpiral(p.innerRadius, p.pitch, p.turns)
        : p.type === "helix"
          ? new Helix(p.innerRadius, p.pitch * p.turns, p.turns)
          : new ConeSpiral(p.innerRadius, p.pitch, p.turns, p.coneAngle);
    return new THREE.TubeGeometry(curve, p.turns * 48, p.conductorDiameter / 2, 10, false);
  }, [p.type, p.innerRadius, p.pitch, p.turns, p.conductorDiameter, p.coneAngle]);

  return (
    <mesh geometry={geom} position={[0, p.baseHeight, 0]} {...handlers}>
      <Glow state={state} color={MATERIAL_COLOR[p.material]} />
    </mesh>
  );
}

function ToploadMesh() {
  const p = useStore((s) => s.params.topload);
  const secH = useStore((s) => s.params.secondary.height);
  const { state, handlers } = usePickable("topload");
  const y =
    secH + (p.shape === "toroid" ? p.minorDiameter / 2 + 0.02 : p.sphereDiameter / 2 + 0.02);
  return (
    <mesh
      position={[0, y, 0]}
      rotation={p.shape === "toroid" ? [Math.PI / 2, 0, 0] : [0, 0, 0]}
      {...handlers}
    >
      {p.shape === "toroid" ? (
        <torusGeometry
          args={[(p.majorDiameter - p.minorDiameter) / 2, p.minorDiameter / 2, 24, 96]}
        />
      ) : (
        <sphereGeometry args={[p.sphereDiameter / 2, 48, 32]} />
      )}
      <Glow state={state} color={MATERIAL_COLOR[p.material]} />
    </mesh>
  );
}

/* Faint breathing corona point light above the topload — the scene's one indulgence. */
function CoronaLight() {
  const secH = useStore((s) => s.params.secondary.height);
  const ref = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.intensity = 0.5 + 0.25 * Math.sin(clock.elapsedTime * 2.1);
  });
  return (
    <pointLight ref={ref} position={[0, secH + 0.25, 0]} color="#9d7bff" intensity={0.6} distance={1.6} />
  );
}

export default function Scene3D() {
  const setSelected = useStore((s) => s.setSelected);
  return (
    <Canvas
      camera={{ position: [1.1, 0.75, 1.1], fov: 42, near: 0.01, far: 50 }}
      onPointerMissed={() => setSelected(null)}
      dpr={[1, 2]}
    >
      <color attach="background" args={["#101318"]} />
      <fog attach="fog" args={["#101318", 4, 10]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[3, 4, 2]} intensity={1.1} />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} color="#aebbff" />
      <CoronaLight />

      <group position={[0, 0, 0]}>
        <Primary />
        <Secondary />
        <ToploadMesh />
      </group>

      <Grid
        position={[0, -0.001, 0]}
        args={[12, 12]}
        cellSize={0.1}
        cellColor="#1d222b"
        sectionSize={0.5}
        sectionColor="#2a3038"
        fadeDistance={6}
        infiniteGrid
      />
      <OrbitControls
        makeDefault
        target={[0, 0.32, 0]}
        minDistance={0.3}
        maxDistance={5}
        maxPolarAngle={Math.PI * 0.52}
      />
    </Canvas>
  );
}
