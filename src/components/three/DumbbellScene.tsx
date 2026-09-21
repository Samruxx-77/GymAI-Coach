import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Float, Lightformer, Sparkles } from "@react-three/drei";

const ACCENT = "#7c5cff";
const ACCENT_LIGHT = "#a78bfa";
const STEEL = "#d7dde8";
const IRON = "#28304a";

/* [radius, width, x-position] per side — reads like a loaded dumbbell */
const PLATES: Array<[number, number, number]> = [
  [0.92, 0.28, 2.05],
  [0.78, 0.22, 2.5],
  [0.62, 0.2, 2.9],
];

function Plate({ radius, width, x }: { radius: number; width: number; x: number }) {
  return (
    <group position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[radius, radius, width, 48]} />
        <meshStandardMaterial color={IRON} metalness={0.9} roughness={0.32} />
      </mesh>
      {/* accent ring face */}
      <mesh position={[width / 2 + 0.001, 0, 0]} rotation={[0, 0, 0]}>
        <torusGeometry args={[radius * 0.72, radius * 0.075, 12, 48]} />
        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.55} metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[-width / 2 - 0.001, 0, 0]}>
        <torusGeometry args={[radius * 0.72, radius * 0.075, 12, 48]} />
        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.55} metalness={0.4} roughness={0.4} />
      </mesh>
    </group>
  );
}

function Dumbbell() {
  const group = useRef<THREE.Group>(null);
  const target = useRef({ x: 0, y: 0 });

  // Pointer parallax — module-local listener keeps the group at scene root.
  useMemo(() => {
    if (typeof window === "undefined" || !window.matchMedia?.("(pointer: fine)").matches) return;
    const onMove = (e: PointerEvent) => {
      target.current.x = (e.clientX / window.innerWidth - 0.5) * 0.5;
      target.current.y = (e.clientY / window.innerHeight - 0.5) * 0.35;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    g.rotation.y += delta * 0.28;
    g.rotation.x += (target.current.y - g.rotation.x) * Math.min(1, delta * 3);
    g.rotation.z = Math.sin(t * 0.6) * 0.05 + target.current.x * 0.3;
    g.position.y = Math.sin(t * 0.9) * 0.12;
  });

  return (
    <group ref={group} rotation={[0.18, 0.6, 0.06]}>
      {/* handle */}
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 4.6, 32]} />
        <meshStandardMaterial color={STEEL} metalness={1} roughness={0.18} />
      </mesh>
      {/* knurling hint */}
      {[0.7, 0.9, 1.1, 1.3].map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.165, 0.165, 0.06, 32]} />
          <meshStandardMaterial color={STEEL} metalness={1} roughness={0.5} />
        </mesh>
      ))}
      {/* collars */}
      {[1.68, -1.68].map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 0.22, 32]} />
          <meshStandardMaterial color={STEEL} metalness={1} roughness={0.25} />
        </mesh>
      ))}
      {PLATES.map((p, i) => (
        <Plate key={i} radius={p[0]} width={p[1]} x={p[2]} />
      ))}
      {PLATES.map((p, i) => (
        <Plate key={`m${i}`} radius={p[0]} width={p[1]} x={-p[2]} />
      ))}
    </group>
  );
}

/** Studio-lit metallic dumbbell with violet rim light + contact shadow. */
export default function DumbbellScene({ quality = "high" }: { quality?: "high" | "low" }) {
  const envRes = quality === "high" ? 256 : 128;
  return (
    <Canvas
      dpr={[1, quality === "high" ? 2 : 1.25]}
      camera={{ position: [0, 0.6, 7.2], fov: 38 }}
      gl={{ antialias: quality === "high", alpha: true, powerPreference: "high-performance" }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 5]} intensity={1.1} />
      <Float speed={1.6} rotationIntensity={0.25} floatIntensity={0.7}>
        <Dumbbell />
      </Float>
      <Sparkles count={quality === "high" ? 60 : 24} scale={[9, 5.5, 4]} size={2.2} speed={0.32} opacity={0.5} color={ACCENT_LIGHT} />
      <Environment resolution={envRes} frames={1}>
        <Lightformer form="rect" intensity={2.4} position={[0, 4, 3]} scale={[7, 2, 1]} />
        <Lightformer form="rect" intensity={1.6} color={ACCENT_LIGHT} position={[-4, 1, 2]} scale={[3, 5, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#5b8cff" position={[4, -1, 3]} scale={[3, 5, 1]} />
      </Environment>
      <ContactShadows position={[0, -1.7, 0]} opacity={0.5} scale={11} blur={2.6} far={4} color="#000000" />
    </Canvas>
  );
}
