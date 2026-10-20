"use client";

import { Environment, Lightformer, RoundedBox, SoftShadows } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, Vignette } from "@react-three/postprocessing";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { backOut, lerp, segment, smooth, type ProgressRef } from "./progress";
import { calendarPage, glowPool, phoneScreen } from "./textures";

export const SCENE_BG = "#24170d";

const C = {
  clay: "#ece2d2",
  clayShade: "#e2d9ca",
  ink: "#2b2723",
  coral: "#ff5a36",
  peach: "#f4c3a1",
  sage: "#c4d8ae",
  lilac: "#d6c8f0",
  sky: "#bed6ee",
  butter: "#f3df98",
  cream: "#fff8ee",
  bark: "#8a6248",
  warm: "#ffb874",
};

function Clay({ color, rough = 0.78 }: { color: string; rough?: number }) {
  return <meshStandardMaterial color={color} roughness={rough} metalness={0} envMapIntensity={0.6} />;
}

/** Bright, unlit-looking material for things that glow (bloom picks these up). */
function Glow({ color, intensity = 3 }: { color: string; intensity?: number }) {
  return <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} toneMapped={false} />;
}

/** Eased progress that trails the scroll position, so jumps animate instead of snapping. */
function useEased(progress: ProgressRef) {
  const eased = useRef(progress.current);
  useFrame((_, dt) => {
    eased.current = lerp(eased.current, progress.current, 1 - Math.exp(-dt * 5));
  });
  return eased;
}

function usePop(p: ProgressRef, a: number, b: number) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = segment(p.current, a, b);
    ref.current?.scale.setScalar(t === 0 ? 0.0001 : Math.max(0.0001, backOut(t)));
  });
  return ref;
}

const W = 6.4;
const D = 4.2;
const FLOOR_Y = -1.5;

function Counter({ p }: { p: ProgressRef }) {
  const flutes = useRef<THREE.InstancedMesh>(null);
  const strip = useRef<THREE.MeshStandardMaterial>(null);
  const pool = useRef<THREE.MeshBasicMaterial>(null);
  const poolTex = useMemo(() => glowPool(), []);

  // Tightly packed vertical flutes around the skirt, like a fluted bar counter.
  const spots = useMemo(() => {
    const out: [number, number][] = [];
    const w = W - 0.45;
    const d = D - 0.45;
    const step = 0.118;
    for (let x = -w / 2; x <= w / 2 + 1e-6; x += step) out.push([x, d / 2], [x, -d / 2]);
    for (let z = -d / 2 + step; z < d / 2 - 1e-6; z += step) out.push([w / 2, z], [-w / 2, z]);
    return out;
  }, []);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      m.setPosition(x, -0.92, z);
      flutes.current!.setMatrixAt(i, m);
    });
    flutes.current!.instanceMatrix.needsUpdate = true;
  }, [spots]);

  useFrame(() => {
    const dusk = smooth(segment(p.current, 0.7, 0.95));
    if (strip.current) strip.current.emissiveIntensity = lerp(1.2, 4, dusk);
    if (pool.current) pool.current.opacity = lerp(0.35, 0.85, dusk);
  });

  return (
    <group>
      <RoundedBox args={[W, 0.3, D]} radius={0.15} smoothness={5} position={[0, -0.15, 0]}>
        <Clay color={C.clay} />
      </RoundedBox>
      <instancedMesh ref={flutes} args={[undefined, undefined, spots.length]}>
        <cylinderGeometry args={[0.064, 0.064, 1.08, 14]} />
        <Clay color={C.clayShade} />
      </instancedMesh>
      {/* Core behind the flutes so there are no gaps to see through. */}
      <mesh position={[0, -0.92, 0]}>
        <boxGeometry args={[W - 0.6, 1.08, D - 0.6]} />
        <Clay color={C.clayShade} />
      </mesh>
      {/* LED strip under the lip. */}
      <mesh position={[0, -0.33, 0]} userData={{ noShadow: true }}>
        <boxGeometry args={[W - 0.32, 0.03, D - 0.32]} />
        <meshStandardMaterial ref={strip} color={C.warm} emissive={C.warm} emissiveIntensity={1.2} toneMapped={false} />
      </mesh>
      {/* Warm pool of light on the floor. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y + 0.005, 0]} userData={{ noShadow: true }}>
        <planeGeometry args={[W * 2.1, D * 2.4]} />
        <meshBasicMaterial ref={pool} map={poolTex} transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, 0]}>
      <planeGeometry args={[80, 80]} />
      <meshStandardMaterial color={SCENE_BG} roughness={1} />
    </mesh>
  );
}

function Phone({ p }: { p: ProgressRef }) {
  const group = useRef<THREE.Group>(null);
  const bars = useRef<THREE.Group>(null);
  const screen = useMemo(() => phoneScreen(), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const talk = 1 - segment(p.current, 0.24, 0.36);
    const aside = smooth(segment(p.current, 0.48, 0.62));
    if (group.current) {
      group.current.position.x = lerp(-1.75, -2.45, aside);
      group.current.position.z = lerp(0.35, 0.15, aside);
      group.current.rotation.y = lerp(0.55, 0.85, aside);
    }
    bars.current?.children.forEach((bar, i) => {
      const h = (0.3 + 0.7 * Math.abs(Math.sin(t * 2.6 + i * 0.85))) * talk;
      bar.visible = talk > 0.02;
      bar.scale.set(1, Math.max(0.001, h), 1);
      bar.position.y = 0.12 + 0.42 * h;
    });
  });

  return (
    <group ref={group} position={[-1.75, 0, 0.35]} rotation={[0, 0.55, 0]}>
      {/* Little stand */}
      <RoundedBox args={[0.62, 0.12, 0.5]} radius={0.05} position={[0, 0.06, 0.02]}>
        <Clay color={C.clayShade} />
      </RoundedBox>
      <group position={[0, 0.98, -0.05]} rotation={[-0.16, 0, 0]}>
        <RoundedBox args={[0.96, 1.86, 0.13]} radius={0.12} smoothness={6}>
          <meshStandardMaterial color={C.ink} roughness={0.35} metalness={0.1} />
        </RoundedBox>
        <mesh position={[0, 0, 0.068]} userData={{ noShadow: true }}>
          <planeGeometry args={[0.84, 1.72]} />
          <meshStandardMaterial map={screen} emissiveMap={screen} emissive="#ffffff" emissiveIntensity={0.9} roughness={0.25} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.79, 0.07]} userData={{ noShadow: true }}>
          <planeGeometry args={[0.22, 0.06]} />
          <meshBasicMaterial color="#0d0c0b" />
        </mesh>
      </group>
      <group ref={bars} position={[0.75, 0, 0.55]}>
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i} position={[i * 0.17, 0.5, 0]}>
            <capsuleGeometry args={[0.05, 0.85, 6, 12]} />
            <meshStandardMaterial color={C.coral} emissive={C.coral} emissiveIntensity={0.55} roughness={0.5} />
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
      const t = smooth(segment(p.current, 0.27 + i * 0.05, 0.42 + i * 0.05));
      const from = new THREE.Vector3(-1.45, 1.1, 0.6);
      const to = new THREE.Vector3(-0.1 + i * 0.14, 0.04 + i * 0.075, -0.6 - i * 0.05);
      g.position.lerpVectors(from, to, t);
      g.position.y += Math.sin(t * Math.PI) * 0.8 + Math.sin(clock.elapsedTime * 1.3 + i) * 0.008;
      g.rotation.set(lerp(-0.4, 0, t), lerp(0.9, -0.3 + i * 0.24, t), lerp(0.25, 0, t));
      g.scale.setScalar(Math.max(0.0001, Math.min(1, t * 3)));
    });
  });
  return (
    <>
      {cardTones.map((tone, i) => (
        <group key={tone} ref={(el) => void (refs.current[i] = el)}>
          <RoundedBox args={[1.35, 0.06, 0.9]} radius={0.025} smoothness={3}>
            <Clay color="#ffffff" rough={0.6} />
          </RoundedBox>
          <mesh position={[-0.47, 0.034, -0.2]}>
            <cylinderGeometry args={[0.13, 0.13, 0.012, 24]} />
            <Clay color={tone} />
          </mesh>
          {[0, 1, 2].map((l) => (
            <RoundedBox key={l} args={[l === 0 ? 0.55 : 1 - l * 0.22, 0.012, 0.06]} radius={0.006} position={[l === 0 ? 0.0 : -0.08 + l * 0.0, 0.034, -0.24 + l * 0.2]}>
              <Clay color={l === 0 ? C.ink : C.clayShade} />
            </RoundedBox>
          ))}
        </group>
      ))}
    </>
  );
}

function Cake({ p }: { p: ProgressRef }) {
  const ref = usePop(p, 0.5, 0.6);
  const flames = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const drips = useMemo(
    () => Array.from({ length: 14 }, (_, i) => ({ a: (i / 14) * Math.PI * 2, len: 0.06 + ((i * 37) % 7) * 0.025 })),
    [],
  );
  useFrame(({ clock }) => {
    const lit = smooth(segment(p.current, 0.58, 0.66));
    flames.current?.children.forEach((f, i) => {
      f.visible = lit > 0.02;
      f.scale.set(lit, lit * (1 + 0.18 * Math.sin(clock.elapsedTime * 11 + i * 2)), lit);
    });
    if (light.current) light.current.intensity = lit * 3;
  });
  return (
    <group ref={ref} position={[1.6, 0, 0.75]}>
      <mesh position={[0, 0.025, 0]}>
        <cylinderGeometry args={[0.82, 0.86, 0.05, 48]} />
        <Clay color="#ffffff" rough={0.4} />
      </mesh>
      <mesh position={[0, 0.27, 0]}>
        <cylinderGeometry args={[0.64, 0.64, 0.44, 48]} />
        <Clay color={C.peach} />
      </mesh>
      {/* Drip icing on the bottom tier */}
      <mesh position={[0, 0.48, 0]}>
        <cylinderGeometry args={[0.655, 0.655, 0.06, 48]} />
        <Clay color={C.cream} rough={0.5} />
      </mesh>
      {drips.map((d) => (
        <mesh key={d.a} position={[Math.cos(d.a) * 0.645, 0.45 - d.len / 2, Math.sin(d.a) * 0.645]}>
          <capsuleGeometry args={[0.035, d.len, 4, 8]} />
          <Clay color={C.cream} rough={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 0.66, 0]}>
        <cylinderGeometry args={[0.42, 0.42, 0.32, 48]} />
        <Clay color={C.cream} rough={0.55} />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} position={[Math.cos(i * 1.05) * 0.3, 0.86, Math.sin(i * 1.05) * 0.3]}>
          <sphereGeometry args={[0.055, 16, 16]} />
          <Clay color={C.coral} rough={0.35} />
        </mesh>
      ))}
      <group>
        {[-0.12, 0.05, 0.16].map((x, i) => (
          <mesh key={x} position={[x, 1.0, i === 1 ? -0.1 : 0.06]}>
            <cylinderGeometry args={[0.022, 0.022, 0.28, 10]} />
            <Clay color={i === 1 ? C.sky : C.lilac} />
          </mesh>
        ))}
      </group>
      <group ref={flames}>
        {[-0.12, 0.05, 0.16].map((x, i) => (
          <mesh key={x} position={[x, 1.2, i === 1 ? -0.1 : 0.06]} userData={{ noShadow: true }}>
            <coneGeometry args={[0.035, 0.12, 12]} />
            <Glow color={C.warm} intensity={6} />
          </mesh>
        ))}
      </group>
      <pointLight ref={light} position={[0, 1.4, 0]} color={C.warm} intensity={0} distance={5} decay={2} />
    </group>
  );
}

function Calendar({ p }: { p: ProgressRef }) {
  const ref = usePop(p, 0.54, 0.64);
  const page = useMemo(() => calendarPage(), []);
  return (
    <group ref={ref} position={[2.2, 0, -1.05]} rotation={[0, -0.55, 0]}>
      <group position={[0, 0.6, 0]} rotation={[-0.14, 0, 0]}>
        <RoundedBox args={[1.05, 1.15, 0.14]} radius={0.05}>
          <Clay color="#ffffff" />
        </RoundedBox>
        <mesh position={[0, 0, 0.072]}>
          <planeGeometry args={[0.95, 1.04]} />
          <meshStandardMaterial map={page} roughness={0.7} />
        </mesh>
        {[-0.3, 0.3].map((x) => (
          <mesh key={x} position={[x, 0.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.05, 0.015, 8, 20]} />
            <meshStandardMaterial color="#b9b2a6" roughness={0.3} metalness={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Gift({ p }: { p: ProgressRef }) {
  const ref = usePop(p, 0.56, 0.66);
  return (
    <group ref={ref} position={[0.2, 0, 1.2]} rotation={[0, 0.45, 0]}>
      <RoundedBox args={[0.72, 0.58, 0.72]} radius={0.05} position={[0, 0.29, 0]}>
        <Clay color={C.lilac} />
      </RoundedBox>
      <RoundedBox args={[0.78, 0.12, 0.78]} radius={0.04} position={[0, 0.6, 0]}>
        <Clay color={C.lilac} />
      </RoundedBox>
      <mesh position={[0, 0.33, 0]}>
        <boxGeometry args={[0.8, 0.68, 0.11]} />
        <Clay color={C.coral} rough={0.45} />
      </mesh>
      <mesh position={[0, 0.33, 0]}>
        <boxGeometry args={[0.11, 0.68, 0.8]} />
        <Clay color={C.coral} rough={0.45} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.11, 0.74, 0]} rotation={[0, 0, s * 0.7]}>
          <torusGeometry args={[0.1, 0.035, 10, 24]} />
          <Clay color={C.coral} rough={0.45} />
        </mesh>
      ))}
    </group>
  );
}

/** Triangular prism for gable roofs. */
const roofGeometry = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(-0.42, 0);
  shape.lineTo(0, 0.34);
  shape.lineTo(0.42, 0);
  shape.lineTo(-0.42, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.74, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
  g.translate(0, 0, -0.37);
  return g;
})();

const houses = [
  { x: -2.55, z: -1.45, tone: C.peach, h: 0.5, r: 0.2 },
  { x: -1.6, z: -1.55, tone: C.sky, h: 0.68, r: -0.1 },
  { x: -0.65, z: -1.45, tone: C.sage, h: 0.55, r: 0.15 },
  { x: -1.3, z: 1.45, tone: C.lilac, h: 0.6, r: 0.35 },
  { x: -2.45, z: 1.55, tone: C.butter, h: 0.48, r: -0.25 },
];
const trees = [
  { x: 0.35, z: -1.6, s: 1 },
  { x: -0.55, z: 0.95, s: 0.8 },
  { x: 2.7, z: 1.6, s: 0.9 },
];

function Neighbourhood({ p }: { p: ProgressRef }) {
  const houseRefs = useRef<(THREE.Group | null)[]>([]);
  const treeRefs = useRef<(THREE.Group | null)[]>([]);
  const windows = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const lamp = useRef<THREE.MeshStandardMaterial>(null);
  const lampLight = useRef<THREE.PointLight>(null);
  const lampGroup = useRef<THREE.Group>(null);

  useFrame(() => {
    houseRefs.current.forEach((g, i) => {
      const t = segment(p.current, 0.7 + i * 0.022, 0.79 + i * 0.022);
      g?.scale.setScalar(t === 0 ? 0.0001 : Math.max(0.0001, backOut(t)));
    });
    treeRefs.current.forEach((g, i) => {
      const t = segment(p.current, 0.74 + i * 0.03, 0.83 + i * 0.03);
      g?.scale.setScalar(t === 0 ? 0.0001 : Math.max(0.0001, backOut(t) * trees[i]!.s));
    });
    const lt = segment(p.current, 0.76, 0.84);
    lampGroup.current?.scale.setScalar(lt === 0 ? 0.0001 : Math.max(0.0001, backOut(lt)));
    windows.current.forEach((m, i) => {
      if (!m) return;
      // One window at a time comes on, like people getting back in touch.
      const on = smooth(segment(p.current, 0.82 + i * 0.03, 0.86 + i * 0.03));
      m.emissiveIntensity = on * 5;
      m.color.set(on > 0.05 ? C.warm : "#5b4a3c");
    });
    const dusk = smooth(segment(p.current, 0.8, 0.92));
    if (lamp.current) lamp.current.emissiveIntensity = dusk * 6;
    if (lampLight.current) lampLight.current.intensity = dusk * 2.5;
  });

  return (
    <>
      {houses.map((h, i) => (
        <group key={i} ref={(el) => void (houseRefs.current[i] = el)} position={[h.x, 0, h.z]} rotation={[0, h.r, 0]}>
          <RoundedBox args={[0.7, h.h, 0.66]} radius={0.04} position={[0, h.h / 2, 0]}>
            <Clay color={h.tone} />
          </RoundedBox>
          <mesh geometry={roofGeometry} position={[0, h.h, 0]}>
            <Clay color={C.cream} rough={0.6} />
          </mesh>
          <RoundedBox args={[0.1, 0.22, 0.1]} radius={0.02} position={[0.2, h.h + 0.22, -0.12]}>
            <Clay color={C.bark} />
          </RoundedBox>
          <RoundedBox args={[0.16, 0.26, 0.03]} radius={0.015} position={[-0.17, 0.13, 0.335]}>
            <Clay color={C.ink} />
          </RoundedBox>
          <mesh position={[0.14, h.h * 0.58, 0.333]} userData={{ noShadow: true }}>
            <planeGeometry args={[0.18, 0.18]} />
            <meshStandardMaterial ref={(m) => void (windows.current[i] = m)} color="#5b4a3c" emissive={C.warm} emissiveIntensity={0} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {trees.map((t, i) => (
        <group key={i} ref={(el) => void (treeRefs.current[i] = el)} position={[t.x, 0, t.z]}>
          <mesh position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.05, 0.065, 0.36, 10]} />
            <Clay color={C.bark} />
          </mesh>
          <mesh position={[0, 0.52, 0]}>
            <sphereGeometry args={[0.28, 20, 20]} />
            <Clay color={C.sage} />
          </mesh>
          <mesh position={[0.08, 0.76, 0.02]}>
            <sphereGeometry args={[0.19, 20, 20]} />
            <Clay color={C.sage} />
          </mesh>
        </group>
      ))}
      <group ref={lampGroup} position={[0.85, 0, -1.65]}>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.022, 0.03, 1, 10]} />
          <Clay color={C.ink} rough={0.4} />
        </mesh>
        <mesh position={[0, 1.04, 0]} userData={{ noShadow: true }}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial ref={lamp} color={C.cream} emissive={C.warm} emissiveIntensity={0} toneMapped={false} />
        </mesh>
        <pointLight ref={lampLight} position={[0, 1.05, 0]} color={C.warm} intensity={0} distance={3} decay={2} />
      </group>
    </>
  );
}

/** Where the camera looks in each chapter, and how close. */
const shots = [
  { at: 0.0, target: new THREE.Vector3(-0.95, 0.75, 0.55), zoom: 1.6 },
  { at: 0.3, target: new THREE.Vector3(-0.35, 0.45, -0.1), zoom: 1.35 },
  { at: 0.56, target: new THREE.Vector3(1.25, 0.5, 0.25), zoom: 1.5 },
  { at: 0.8, target: new THREE.Vector3(0, 0.15, 0), zoom: 0.86 },
];

function Rig({ p }: { p: ProgressRef }) {
  const key = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const target = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera, size }) => {
    const t = p.current;
    // Blend between neighbouring shots.
    let i = shots.findLastIndex((s) => t >= s.at);
    if (i < 0) i = 0;
    const a = shots[i]!;
    const b = shots[Math.min(i + 1, shots.length - 1)]!;
    const k = b === a ? 0 : smooth(segment(t, a.at + (b.at - a.at) * 0.45, b.at));
    target.lerpVectors(a.target, b.target, k);
    const zoomMul = lerp(a.zoom, b.zoom, k);

    const az = THREE.MathUtils.degToRad(40 + (t - 0.5) * 18);
    const el = THREE.MathUtils.degToRad(31);
    const r = 16;
    camera.position.set(target.x + r * Math.cos(el) * Math.sin(az), target.y + r * Math.sin(el), target.z + r * Math.cos(el) * Math.cos(az));
    camera.lookAt(target);
    const ortho = camera as THREE.OrthographicCamera;
    const base = size.width < 640 ? Math.min(size.width / 7.8, size.height / 5) : Math.min(size.width / 8.6, size.height / 6.4);
    ortho.zoom = base * (size.width < 640 ? Math.min(zoomMul, 1.35) : zoomMul);
    // On wide screens the canvas spans the whole section; push the diorama right of the text.
    if (size.width >= 1024) ortho.setViewOffset(size.width, size.height, -size.width * 0.21, 0, size.width, size.height);
    else ortho.clearViewOffset();
    ortho.updateProjectionMatrix();

    const dusk = smooth(segment(t, 0.72, 0.95));
    if (key.current) key.current.intensity = lerp(1.9, 0.8, dusk);
    if (hemi.current) hemi.current.intensity = lerp(0.55, 0.3, dusk);
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={["#fff3e2", "#4a3220", 0.55]} />
      <directionalLight
        ref={key}
        position={[-5, 9, 4]}
        intensity={1.9}
        color="#ffe6c8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-camera-near={1}
        shadow-camera-far={30}
      />
    </>
  );
}

/** Every mesh casts and receives shadows unless it's a light source. */
function useShadows() {
  const root = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    root.current?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.userData.noShadow) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  });
  return root;
}

function Story({ progress }: { progress: ProgressRef }) {
  const p = useEased(progress);
  const root = useShadows();
  return (
    <>
      <color attach="background" args={[SCENE_BG]} />
      <fog attach="fog" args={[SCENE_BG, 16, 30]} />
      <Rig p={p} />
      {/* Soft studio fill from above and the sides; no HDR file needed. */}
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={1.5} color="#ffeedb" position={[0, 6, 2]} scale={[10, 4, 1]} rotation-x={Math.PI / 2} />
        <Lightformer form="rect" intensity={0.8} color="#ffd9b0" position={[-6, 2, 3]} scale={[4, 3, 1]} rotation-y={Math.PI / 2} />
        <Lightformer form="rect" intensity={0.5} color="#c8d8ff" position={[6, 2, -3]} scale={[4, 3, 1]} rotation-y={-Math.PI / 2} />
      </Environment>
      <group ref={root}>
        <Floor />
        <Counter p={p} />
        <Phone p={p} />
        <Cards p={p} />
        <Cake p={p} />
        <Calendar p={p} />
        <Gift p={p} />
        <Neighbourhood p={p} />
      </group>
    </>
  );
}

export default function StoryScene({ progress, active, rich }: { progress: ProgressRef; active: boolean; rich: boolean }) {
  return (
    <Canvas
      orthographic
      shadows
      dpr={rich ? [1, 2] : [1, 1.5]}
      frameloop={active ? "always" : "never"}
      camera={{ position: [10, 8, 10], zoom: 100, near: 0.1, far: 100 }}
      gl={{ antialias: !rich, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.95 }}
      aria-hidden
    >
      {rich && <SoftShadows size={18} samples={12} focus={0.5} />}
      <Story progress={progress} />
      {rich && (
        <EffectComposer multisampling={4}>
          <N8AO aoRadius={0.5} intensity={2.2} distanceFalloff={0.6} color="#2a1608" />
          <Bloom mipmapBlur intensity={0.55} luminanceThreshold={0.9} luminanceSmoothing={0.2} />
          <Vignette offset={0.25} darkness={0.55} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
