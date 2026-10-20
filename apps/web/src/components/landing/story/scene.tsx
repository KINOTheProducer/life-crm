"use client";

import { ContactShadows, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { backOut, lerp, segment, smooth, type ProgressRef } from "./progress";

const C = {
  clay: "#f1ebe1",
  clayDark: "#e3dccf",
  ink: "#2b2723",
  coral: "#ff5a36",
  peach: "#f7cdb0",
  sage: "#cfe0bd",
  lilac: "#dccff4",
  sky: "#c9def2",
  butter: "#f6e4a4",
  warm: "#ffc98f",
};

function Clay({ color, ...props }: { color: string } & THREE.MeshStandardMaterialParameters) {
  return <meshStandardMaterial color={color} roughness={0.82} metalness={0} {...props} />;
}

/** Eased progress that follows the scroll position, so jumps animate instead of snapping. */
function useEased(progress: ProgressRef) {
  const eased = useRef(progress.current);
  useFrame((_, dt) => {
    eased.current = lerp(eased.current, progress.current, 1 - Math.exp(-dt * 6));
  });
  return eased;
}

const PLINTH = { w: 6.4, d: 4.2, top: 0 };

function Plinth({ p }: { p: ProgressRef }) {
  const flutes = useRef<THREE.InstancedMesh>(null);
  const glow = useRef<THREE.MeshStandardMaterial>(null);

  // Thin vertical flutes around the plinth skirt, like a fluted counter.
  const positions = useMemo(() => {
    const out: [number, number][] = [];
    const w = PLINTH.w - 0.5;
    const d = PLINTH.d - 0.5;
    const step = 0.15;
    for (let x = -w / 2; x <= w / 2; x += step) out.push([x, d / 2], [x, -d / 2]);
    for (let z = -d / 2 + step; z < d / 2; z += step) out.push([w / 2, z], [-w / 2, z]);
    return out;
  }, []);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    positions.forEach(([x, z], i) => {
      m.setPosition(x, -0.85, z);
      flutes.current!.setMatrixAt(i, m);
    });
    flutes.current!.instanceMatrix.needsUpdate = true;
  }, [positions]);

  useFrame(() => {
    // The under-glow comes up as evening falls in the last chapter.
    if (glow.current) glow.current.emissiveIntensity = lerp(0.5, 3, smooth(segment(p.current, 0.72, 0.95)));
  });

  return (
    <group>
      <RoundedBox args={[PLINTH.w, 0.32, PLINTH.d]} radius={0.16} smoothness={4} position={[0, -0.16, 0]}>
        <Clay color={C.clay} />
      </RoundedBox>
      <instancedMesh ref={flutes} args={[undefined, undefined, positions.length]}>
        <cylinderGeometry args={[0.055, 0.055, 1.1, 10]} />
        <Clay color={C.clayDark} />
      </instancedMesh>
      {/* Warm light strip tucked under the top. */}
      <mesh position={[0, -0.36, 0]}>
        <boxGeometry args={[PLINTH.w - 0.35, 0.05, PLINTH.d - 0.35]} />
        <meshStandardMaterial ref={glow} color={C.warm} emissive={C.warm} emissiveIntensity={0.5} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Phone({ p }: { p: ProgressRef }) {
  const group = useRef<THREE.Group>(null);
  const screen = useRef<THREE.MeshStandardMaterial>(null);
  const bars = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const talk = 1 - segment(p.current, 0.24, 0.36); // bars fade as they turn into cards
    const leave = smooth(segment(p.current, 0.5, 0.62)); // phone steps aside for the birthday scene
    if (group.current) {
      group.current.position.x = lerp(-1.9, -2.55, leave);
      group.current.rotation.y = lerp(0.5, 0.9, leave);
    }
    if (screen.current) screen.current.emissiveIntensity = 0.6 + 0.9 * talk + 0.15 * Math.sin(t * 3);
    bars.current?.children.forEach((bar, i) => {
      const h = (0.25 + 0.75 * Math.abs(Math.sin(t * 2.4 + i * 0.9))) * talk;
      bar.visible = talk > 0.02;
      bar.scale.y = Math.max(0.001, h);
      bar.position.y = 0.6 * h;
    });
  });

  return (
    <group ref={group} position={[-1.9, 0, 0.6]} rotation={[0, 0.5, 0]}>
      <group rotation={[-0.18, 0, 0]} position={[0, 0.85, 0]}>
        <RoundedBox args={[0.92, 1.72, 0.12]} radius={0.1} smoothness={4}>
          <Clay color={C.ink} />
        </RoundedBox>
        <mesh position={[0, 0, 0.065]}>
          <planeGeometry args={[0.78, 1.55]} />
          <meshStandardMaterial ref={screen} color={C.coral} emissive={C.coral} emissiveIntensity={1.2} toneMapped={false} />
        </mesh>
      </group>
      <RoundedBox args={[0.5, 0.08, 0.3]} radius={0.03} position={[0, 0.04, 0.05]}>
        <Clay color={C.clayDark} />
      </RoundedBox>
      <group ref={bars} position={[0.85, 0, 0.35]}>
        {Array.from({ length: 9 }, (_, i) => (
          <mesh key={i} position={[i * 0.17, 0.3, 0]}>
            <cylinderGeometry args={[0.045, 0.045, 1.2, 10]} />
            <meshStandardMaterial color={C.coral} emissive={C.coral} emissiveIntensity={0.35} roughness={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

const cardTones = [C.peach, C.butter, C.sage];

function Cards({ p }: { p: ProgressRef }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    refs.current.forEach((g, i) => {
      if (!g) return;
      // Each card flies out of the phone a beat after the last, then settles into a fanned stack.
      const t = smooth(segment(p.current, 0.27 + i * 0.05, 0.42 + i * 0.05));
      const from = new THREE.Vector3(-1.5, 1.1, 0.9);
      const to = new THREE.Vector3(0.2 + i * 0.12, 0.05 + i * 0.07, -0.55 - i * 0.04);
      g.position.lerpVectors(from, to, t);
      g.position.y += Math.sin(t * Math.PI) * 0.9;
      g.rotation.set(lerp(-0.45, 0, t), lerp(0.8, -0.25 + i * 0.22, t), lerp(0.25, 0, t));
      g.scale.setScalar(Math.max(0.001, Math.min(1, t * 3)));
      g.position.y += Math.sin(clock.elapsedTime * 1.4 + i) * 0.01;
    });
  });
  return (
    <>
      {cardTones.map((tone, i) => (
        <group key={tone} ref={(el) => void (refs.current[i] = el)}>
          <RoundedBox args={[1.3, 0.05, 0.85]} radius={0.02} smoothness={3}>
            <Clay color="#ffffff" />
          </RoundedBox>
          <mesh position={[0, 0.03, -0.27]}>
            <boxGeometry args={[1.18, 0.012, 0.2]} />
            <Clay color={tone} />
          </mesh>
          {[0, 1].map((l) => (
            <mesh key={l} position={[-0.12 - l * 0.12, 0.03, 0.02 + l * 0.17]}>
              <boxGeometry args={[0.85 - l * 0.25, 0.01, 0.05]} />
              <Clay color={C.clayDark} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

/** Grows an object up out of the plinth between a and b. */
function usePop(p: ProgressRef, a: number, b: number) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = segment(p.current, a, b);
    const s = Math.max(0.001, t === 0 ? 0 : backOut(t));
    ref.current?.scale.setScalar(s);
  });
  return ref;
}

function Cake({ p }: { p: ProgressRef }) {
  const ref = usePop(p, 0.5, 0.6);
  const flames = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const lit = smooth(segment(p.current, 0.58, 0.66));
    flames.current?.children.forEach((f, i) => {
      f.scale.setScalar(Math.max(0.001, lit * (1 + 0.15 * Math.sin(clock.elapsedTime * 9 + i * 2))));
    });
    if (light.current) light.current.intensity = lit * 2.2;
  });
  return (
    <group ref={ref} position={[1.75, 0, 0.75]}>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.62, 0.62, 0.4, 40]} />
        <Clay color={C.peach} />
      </mesh>
      <mesh position={[0, 0.44, 0]}>
        <cylinderGeometry args={[0.5, 0.52, 0.12, 40]} />
        <Clay color="#fff7f0" />
      </mesh>
      <mesh position={[0, 0.005, 0]}>
        <cylinderGeometry args={[0.78, 0.78, 0.04, 40]} />
        <Clay color="#ffffff" />
      </mesh>
      <group ref={flames}>
        {[-0.2, 0, 0.2].map((x, i) => (
          <group key={x} position={[x, 0.5, i === 1 ? -0.12 : 0.08]}>
            <mesh position={[0, 0.14, 0]}>
              <cylinderGeometry args={[0.025, 0.025, 0.28, 8]} />
              <Clay color={C.sky} />
            </mesh>
            <mesh position={[0, 0.35, 0]} scale={[1, 1.5, 1]}>
              <sphereGeometry args={[0.07, 14, 14]} />
              <meshStandardMaterial color={C.coral} emissive={C.warm} emissiveIntensity={3} toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>
      <pointLight ref={light} position={[0, 1.1, 0]} color={C.warm} intensity={0} distance={4} decay={2} />
    </group>
  );
}

function Calendar({ p }: { p: ProgressRef }) {
  const ref = usePop(p, 0.54, 0.64);
  return (
    <group ref={ref} position={[2.15, 0, -1.05]} rotation={[0, -0.5, 0]}>
      <group position={[0, 0.55, 0]} rotation={[-0.12, 0, 0]}>
        <RoundedBox args={[1, 1.1, 0.12]} radius={0.04}>
          <Clay color="#ffffff" />
        </RoundedBox>
        <mesh position={[0, 0.42, 0.065]}>
          <planeGeometry args={[1, 0.26]} />
          <Clay color={C.coral} />
        </mesh>
        {Array.from({ length: 20 }, (_, i) => {
          const col = i % 5;
          const row = Math.floor(i / 5);
          const today = i === 13;
          return (
            <mesh key={i} position={[-0.36 + col * 0.18, 0.15 - row * 0.17, 0.065]}>
              <circleGeometry args={[today ? 0.07 : 0.035, 16]} />
              <meshStandardMaterial color={today ? C.coral : C.clayDark} emissive={today ? C.coral : "#000"} emissiveIntensity={today ? 0.6 : 0} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

function Gift({ p }: { p: ProgressRef }) {
  const ref = usePop(p, 0.56, 0.66);
  return (
    <group ref={ref} position={[0.25, 0, 1.25]} rotation={[0, 0.4, 0]}>
      <RoundedBox args={[0.7, 0.55, 0.7]} radius={0.04} position={[0, 0.28, 0]}>
        <Clay color={C.lilac} />
      </RoundedBox>
      <mesh position={[0, 0.28, 0]}>
        <boxGeometry args={[0.72, 0.56, 0.12]} />
        <Clay color={C.coral} />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <boxGeometry args={[0.12, 0.56, 0.72]} />
        <Clay color={C.coral} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.1, 0.62, 0]} rotation={[0, 0, s * 0.6]}>
          <torusGeometry args={[0.09, 0.03, 8, 20]} />
          <Clay color={C.coral} />
        </mesh>
      ))}
    </group>
  );
}

// Placed in the free space around the other objects.
const houses = [
  { x: -2.6, z: -1.5, tone: C.peach, h: 0.55 },
  { x: -1.7, z: -1.6, tone: C.sky, h: 0.75 },
  { x: -0.8, z: -1.55, tone: C.sage, h: 0.6 },
  { x: -1.35, z: 1.45, tone: C.lilac, h: 0.65 },
  { x: -2.45, z: 1.6, tone: C.butter, h: 0.5 },
];

function Neighbourhood({ p }: { p: ProgressRef }) {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const windows = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  useFrame(() => {
    groups.current.forEach((g, i) => {
      if (!g) return;
      const t = segment(p.current, 0.7 + i * 0.025, 0.8 + i * 0.025);
      g.scale.setScalar(Math.max(0.001, t === 0 ? 0 : backOut(t)));
    });
    windows.current.forEach((m, i) => {
      if (!m) return;
      // One window at a time comes on, like people getting back in touch.
      const on = smooth(segment(p.current, 0.82 + i * 0.03, 0.86 + i * 0.03));
      m.emissiveIntensity = on * 2.4;
      m.color.set(on > 0.05 ? C.warm : C.clayDark);
    });
  });
  return (
    <>
      {houses.map((h, i) => (
        <group key={i} ref={(el) => void (groups.current[i] = el)} position={[h.x, 0, h.z]} rotation={[0, i * 0.35, 0]}>
          <RoundedBox args={[0.6, h.h, 0.6]} radius={0.03} position={[0, h.h / 2, 0]}>
            <Clay color={h.tone} />
          </RoundedBox>
          <mesh position={[0, h.h + 0.2, 0]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[0.5, 0.4, 4]} />
            <Clay color="#fffaf3" />
          </mesh>
          <mesh position={[0, h.h * 0.55, 0.305]}>
            <planeGeometry args={[0.2, 0.22]} />
            <meshStandardMaterial ref={(m) => void (windows.current[i] = m)} color={C.clayDark} emissive={C.warm} emissiveIntensity={0} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Rig({ p }: { p: ProgressRef }) {
  const key = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  useFrame(({ camera, size }) => {
    const t = p.current;
    const az = THREE.MathUtils.degToRad(38 + (t - 0.5) * 24);
    const el = THREE.MathUtils.degToRad(32);
    const r = 14;
    camera.position.set(r * Math.cos(el) * Math.sin(az), r * Math.sin(el), r * Math.cos(el) * Math.cos(az));
    camera.lookAt(0, 0.2, 0);
    const ortho = camera as THREE.OrthographicCamera;
    // Fill narrow screens more; the diorama is the whole point on a phone.
    ortho.zoom = size.width < 640 ? Math.min(size.width / 7.8, size.height / 5) : Math.min(size.width / 8.4, size.height / 6.2);
    ortho.updateProjectionMatrix();

    // Day to dusk over the last chapter.
    const dusk = smooth(segment(t, 0.72, 0.95));
    if (key.current) key.current.intensity = lerp(2.4, 1, dusk);
    if (hemi.current) hemi.current.intensity = lerp(1.1, 0.65, dusk);
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={["#fff6ea", "#5a4632", 1.1]} />
      <directionalLight ref={key} position={[-4, 8, 5]} intensity={2.4} color="#fff1df" />
    </>
  );
}

function Story({ progress }: { progress: ProgressRef }) {
  const p = useEased(progress);
  return (
    <>
      <Rig p={p} />
      <Plinth p={p} />
      <Phone p={p} />
      <Cards p={p} />
      <Cake p={p} />
      <Calendar p={p} />
      <Gift p={p} />
      <Neighbourhood p={p} />
      <ContactShadows position={[0, 0.002, 0]} scale={[PLINTH.w - 0.2, PLINTH.d - 0.2]} opacity={0.45} blur={2.4} far={2.5} resolution={512} color="#3b2a1c" />
    </>
  );
}

export default function StoryScene({ progress, active }: { progress: ProgressRef; active: boolean }) {
  return (
    <Canvas
      orthographic
      dpr={[1, 2]}
      frameloop={active ? "always" : "never"}
      camera={{ position: [8, 7, 9], zoom: 100, near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      aria-hidden
    >
      <Story progress={progress} />
    </Canvas>
  );
}
