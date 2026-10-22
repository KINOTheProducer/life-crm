"use client";

import { Environment, Lightformer, RoundedBox, SoftShadows } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, Vignette } from "@react-three/postprocessing";
import { type RefObject, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { lerp, segment, smooth, type ProgressRef } from "./progress";
import { appScreen, glowPool, portrait, stickyNote } from "./textures";

export const SCENE_BG = "#24170d";

const C = {
  clay: "#ece2d2",
  clayShade: "#e2d9ca",
  wall: "#e9dfcf",
  sofa: "#d8c3ab",
  ink: "#2b2723",
  coral: "#ff5a36",
  peach: "#f4c3a1",
  sage: "#c4d8ae",
  leaf: "#7f9b5c",
  terracotta: "#c9825f",
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

/** Eased progress that trails the scroll position, so jumps animate instead of snapping. */
function useEased(progress: ProgressRef) {
  const eased = useRef(progress.current);
  useFrame((_, dt) => {
    eased.current = lerp(eased.current, progress.current, 1 - Math.exp(-dt * 5));
  });
  return eased;
}

/** Dusk falls over the last chapter. */
const duskAt = (t: number) => smooth(segment(t, 0.72, 0.92));

// A cutaway room like an architect's model: floor slab, back wall with a window, left wall.
const W = 6.6;
const D = 5.2;
const H = 2.9;
const T = 0.22;
const GROUND_Y = -0.35;
const BACK = -D / 2 + T;
const LEFT = -W / 2 + T;
const WINDOW = { x0: 0.4, x1: 2.6, y0: 1.05, y1: 2.4 };

function roundedRect(path: THREE.Path, x0: number, y0: number, x1: number, y1: number, r: number) {
  path.moveTo(x0 + r, y0);
  path.lineTo(x1 - r, y0);
  path.quadraticCurveTo(x1, y0, x1, y0 + r);
  path.lineTo(x1, y1 - r);
  path.quadraticCurveTo(x1, y1, x1 - r, y1);
  path.lineTo(x0 + r, y1);
  path.quadraticCurveTo(x0, y1, x0, y1 - r);
  path.lineTo(x0, y0 + r);
  path.quadraticCurveTo(x0, y0, x0 + r, y0);
}

/** A wall slab with its open end's top corner rounded off, optionally with a window cut out. */
function wallGeometry(len: number, roundEnd: "start" | "end", hole?: typeof WINDOW) {
  const s = new THREE.Shape();
  const L = len / 2;
  const r = 0.55;
  s.moveTo(-L, 0);
  s.lineTo(L, 0);
  if (roundEnd === "end") {
    s.lineTo(L, H - r);
    s.quadraticCurveTo(L, H, L - r, H);
    s.lineTo(-L, H);
  } else {
    s.lineTo(L, H);
    s.lineTo(-L + r, H);
    s.quadraticCurveTo(-L, H, -L, H - r);
  }
  s.lineTo(-L, 0);
  if (hole) {
    const h = new THREE.Path();
    roundedRect(h, hole.x0, hole.y0, hole.x1, hole.y1, 0.2);
    s.holes.push(h);
  }
  return new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 4, curveSegments: 20 });
}

function Room({ p }: { p: ProgressRef }) {
  const back = useMemo(() => wallGeometry(W, "end", WINDOW), []);
  const left = useMemo(() => wallGeometry(D, "start"), []);
  const sky = useRef<THREE.MeshBasicMaterial>(null);
  const pool = useRef<THREE.MeshBasicMaterial>(null);
  const poolTex = useMemo(() => glowPool(), []);
  const day = useMemo(() => new THREE.Color("#f6dfc4"), []);
  const night = useMemo(() => new THREE.Color("#2f3149"), []);

  useFrame(() => {
    const dusk = duskAt(p.current);
    sky.current?.color.lerpColors(day, night, dusk);
    if (pool.current) pool.current.opacity = lerp(0.25, 0.7, dusk);
  });

  const winW = WINDOW.x1 - WINDOW.x0;
  const winH = WINDOW.y1 - WINDOW.y0;
  const winX = (WINDOW.x0 + WINDOW.x1) / 2;
  const winY = (WINDOW.y0 + WINDOW.y1) / 2;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color={SCENE_BG} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y + 0.005, 0]} userData={{ noShadow: true }}>
        <planeGeometry args={[W * 2.2, D * 2.4]} />
        <meshBasicMaterial ref={pool} map={poolTex} transparent opacity={0.25} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <RoundedBox args={[W, -GROUND_Y, D]} radius={0.16} smoothness={5} position={[0, GROUND_Y / 2, 0]}>
        <Clay color={C.clay} />
      </RoundedBox>
      <mesh geometry={back} position={[0, 0, -D / 2]}>
        <Clay color={C.wall} />
      </mesh>
      <mesh geometry={left} position={[-W / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <Clay color={C.wall} />
      </mesh>
      {/* Sky through the window: warm afternoon, then dusk. */}
      <mesh position={[winX, winY, -D / 2 + 0.02]} userData={{ noShadow: true }}>
        <planeGeometry args={[winW, winH]} />
        <meshBasicMaterial ref={sky} color={day} toneMapped={false} />
      </mesh>
      <mesh position={[winX, winY, -D / 2 + T / 2]}>
        <boxGeometry args={[0.05, winH, 0.05]} />
        <Clay color={C.cream} />
      </mesh>
      <mesh position={[winX, winY + 0.15, -D / 2 + T / 2]}>
        <boxGeometry args={[winW, 0.05, 0.05]} />
        <Clay color={C.cream} />
      </mesh>
      <RoundedBox args={[winW + 0.2, 0.06, 0.24]} radius={0.025} position={[winX, WINDOW.y0 - 0.03, BACK + 0.08]}>
        <Clay color={C.cream} rough={0.6} />
      </RoundedBox>
      {/* Rug */}
      <mesh position={[0.5, 0.012, 0.7]} scale={[1, 1, 0.74]}>
        <cylinderGeometry args={[1.65, 1.65, 0.024, 64]} />
        <Clay color="#e6c7ad" rough={1} />
      </mesh>
    </group>
  );
}

const SIDEBOARD = { x: 1.5, w: 2.1, d: 0.8, h: 0.75 };

function Sideboard() {
  const z = BACK + SIDEBOARD.d / 2;
  return (
    <group position={[SIDEBOARD.x, 0, z]}>
      <RoundedBox args={[SIDEBOARD.w, SIDEBOARD.h - 0.1, SIDEBOARD.d]} radius={0.06} smoothness={4} position={[0, 0.1 + (SIDEBOARD.h - 0.1) / 2, 0]}>
        <Clay color={C.cream} rough={0.6} />
      </RoundedBox>
      {/* Door seams and pulls */}
      {[-0.35, 0.35].map((x) => (
        <mesh key={x} position={[x, 0.42, SIDEBOARD.d / 2 + 0.005]}>
          <boxGeometry args={[0.012, 0.5, 0.01]} />
          <Clay color={C.clayShade} />
        </mesh>
      ))}
      {[-0.5, 0.2, 0.5].map((x) => (
        <mesh key={x} position={[x, 0.55, SIDEBOARD.d / 2 + 0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.03, 12]} />
          <Clay color={C.bark} />
        </mesh>
      ))}
      {[-0.85, 0.85].map((x) => (
        <mesh key={x} position={[x, 0.05, 0]}>
          <boxGeometry args={[0.06, 0.1, SIDEBOARD.d - 0.2]} />
          <Clay color={C.bark} />
        </mesh>
      ))}
      {/* A stack of books and a vase */}
      {[C.sky, C.peach, C.sage].map((tone, i) => (
        <RoundedBox key={tone} args={[0.42 - i * 0.03, 0.07, 0.3]} radius={0.015} position={[0.72, SIDEBOARD.h + 0.035 + i * 0.07, -0.05]} rotation={[0, i * 0.18, 0]}>
          <Clay color={tone} />
        </RoundedBox>
      ))}
      <mesh position={[0.72, SIDEBOARD.h + 0.33, -0.05]}>
        <cylinderGeometry args={[0.06, 0.09, 0.2, 20]} />
        <Clay color={C.terracotta} rough={0.6} />
      </mesh>
    </group>
  );
}

// The desk sits against the left wall; whoever's at it faces the wall (-x), so the camera sees the screen.
const DESK = { x: LEFT + 0.42, z: -0.3, top: 0.75 };
const CHAIR_X = LEFT + 1.35;
const SCREEN = new THREE.Vector3(LEFT + 0.27, 1.37, DESK.z);
const HEAD = new THREE.Vector3(CHAIR_X, 1.31, DESK.z + 0.02);

function Desk() {
  return (
    <group position={[DESK.x, 0, DESK.z]}>
      <RoundedBox args={[0.8, 0.05, 1.7]} radius={0.02} smoothness={3} position={[0, DESK.top - 0.025, 0]}>
        <Clay color={C.cream} rough={0.55} />
      </RoundedBox>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * 0.33, (DESK.top - 0.05) / 2, sz * 0.78]}>
            <cylinderGeometry args={[0.025, 0.025, DESK.top - 0.05, 10]} />
            <Clay color={C.bark} />
          </mesh>
        )),
      )}
      {/* Keyboard and a mug */}
      <RoundedBox args={[0.18, 0.02, 0.6]} radius={0.008} position={[0.2, DESK.top + 0.01, 0]}>
        <Clay color="#ffffff" rough={0.5} />
      </RoundedBox>
      <mesh position={[0.05, DESK.top + 0.06, 0.62]}>
        <cylinderGeometry args={[0.05, 0.045, 0.12, 20]} />
        <Clay color={C.coral} rough={0.45} />
      </mesh>
    </group>
  );
}

function Monitor({ glow }: { glow: RefObject<THREE.PointLight | null> }) {
  return (
    <group position={[LEFT + 0.22, DESK.top, DESK.z]}>
      <RoundedBox args={[0.22, 0.02, 0.3]} radius={0.008} position={[0, 0.01, 0]}>
        <Clay color={C.ink} rough={0.4} />
      </RoundedBox>
      <mesh position={[0, 0.17, 0]}>
        <boxGeometry args={[0.04, 0.32, 0.06]} />
        <Clay color={C.ink} rough={0.4} />
      </mesh>
      <RoundedBox args={[0.05, 0.62, 1.04]} radius={0.02} position={[0, SCREEN.y - DESK.top, 0]}>
        <Clay color={C.ink} rough={0.35} />
      </RoundedBox>
      <pointLight ref={glow} position={[0.7, SCREEN.y - DESK.top - 0.2, 0]} color="#e6eeff" intensity={0.4} distance={2.5} decay={2} />
    </group>
  );
}

function Screen({ tex }: { tex: THREE.Texture }) {
  return (
    <mesh position={[SCREEN.x, SCREEN.y, SCREEN.z]} rotation={[0, Math.PI / 2, 0]} userData={{ noShadow: true }}>
      <planeGeometry args={[0.98, 0.56]} />
      <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.45} roughness={0.9} />
    </mesh>
  );
}

function Chair() {
  return (
    <group>
      <mesh position={[0.05, 0.03, 0]}>
        <cylinderGeometry args={[0.26, 0.28, 0.04, 24]} />
        <Clay color={C.ink} rough={0.4} />
      </mesh>
      <mesh position={[0.05, 0.25, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.42, 10]} />
        <Clay color={C.ink} rough={0.4} />
      </mesh>
      <RoundedBox args={[0.5, 0.07, 0.5]} radius={0.03} position={[0.05, 0.48, 0]}>
        <Clay color={C.sofa} />
      </RoundedBox>
      <RoundedBox args={[0.07, 0.55, 0.46]} radius={0.03} position={[0.33, 0.85, 0]}>
        <Clay color={C.sofa} />
      </RoundedBox>
    </group>
  );
}

type V3 = [number, number, number];

/** Capsule from one point to another, for arms and legs. */
function Limb({ from, to, r, color }: { from: V3; to: V3; r: number; color: string }) {
  const { pos, quat, len } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return { pos: a.add(b).multiplyScalar(0.5), quat, len };
  }, [from, to]);
  return (
    <mesh position={pos} quaternion={quat}>
      <capsuleGeometry args={[r, Math.max(0.001, len - r * 2), 6, 14]} />
      <Clay color={color} />
    </mesh>
  );
}

const SKIN = "#e8b894";
const SWEATER = C.sage;
const PANTS = "#5b4a3c";
const HAIR = "#4a3426";

/** Sweater torso: narrow at the waist, rounded shoulders. Lathed, then squashed front to back. */
const torsoGeometry = (() => {
  const pts = [
    [0, 0],
    [0.14, 0],
    [0.16, 0.06],
    [0.15, 0.2],
    [0.17, 0.34],
    [0.19, 0.42],
    [0.17, 0.48],
    [0.1, 0.52],
    [0, 0.53],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 32);
})();

// Turned a little toward the camera so we see their face side on, not the back of their head.
const SEAT_TURN = 0.35;

function Person({ p }: { p: ProgressRef }) {
  const upper = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const arms = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // Leaning in while there's a lot going on, sitting back once it's all in.
    const ease = smooth(segment(p.current, 0.7, 0.9));
    if (upper.current) {
      upper.current.rotation.z = lerp(0.12, -0.08, ease);
      upper.current.position.y = 0.55 + Math.sin(t * 1.6) * 0.004;
    }
    // Looks up from the screen at the end.
    if (head.current) head.current.rotation.z = lerp(0.08, -0.12, ease) + Math.sin(t * 0.7) * 0.02;
    // Hands come off the keyboard and rest in their lap.
    arms.current.forEach((a) => a && (a.rotation.z = lerp(0, 0.42, ease)));
  });
  return (
    <group>
      {/* Hips and legs */}
      <RoundedBox args={[0.3, 0.16, 0.36]} radius={0.07} smoothness={4} position={[0.06, 0.6, 0]}>
        <Clay color={PANTS} />
      </RoundedBox>
      {[-0.1, 0.1].map((z) => (
        <group key={z}>
          <Limb from={[0.04, 0.6, z]} to={[-0.36, 0.6, z]} r={0.08} color={PANTS} />
          <Limb from={[-0.36, 0.6, z]} to={[-0.4, 0.12, z]} r={0.068} color={PANTS} />
          <RoundedBox args={[0.26, 0.08, 0.12]} radius={0.035} position={[-0.46, 0.04, z]}>
            <Clay color={C.ink} />
          </RoundedBox>
        </group>
      ))}
      <group ref={upper} position={[0.06, 0.55, 0]}>
        <mesh geometry={torsoGeometry} scale={[0.72, 1, 1.12]}>
          <Clay color={SWEATER} />
        </mesh>
        {/* Collar and neck */}
        <mesh position={[0, 0.52, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.065, 0.022, 10, 24]} />
          <Clay color={SWEATER} />
        </mesh>
        <mesh position={[-0.01, 0.58, 0]}>
          <cylinderGeometry args={[0.05, 0.055, 0.12, 16]} />
          <Clay color={SKIN} />
        </mesh>
        <group ref={head} position={[-0.02, 0.64, 0]} scale={1.12}>
          <mesh position={[-0.01, 0.12, 0]} scale={[1, 1.12, 0.94]}>
            <sphereGeometry args={[0.125, 32, 24]} />
            <Clay color={SKIN} />
          </mesh>
          {/* Nose and ears */}
          <mesh position={[-0.135, 0.11, 0]}>
            <sphereGeometry args={[0.022, 12, 10]} />
            <Clay color={SKIN} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0.0, 0.11, s * 0.118]} scale={[0.7, 1, 0.5]}>
              <sphereGeometry args={[0.03, 12, 10]} />
              <Clay color={SKIN} />
            </mesh>
          ))}
          {/* Short hair: a cap over the top and a fuller back */}
          <mesh position={[0.005, 0.15, 0]} scale={[1.02, 1.02, 0.98]}>
            <sphereGeometry args={[0.13, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.42]} />
            <Clay color={HAIR} rough={0.9} />
          </mesh>
          <mesh position={[0.04, 0.12, 0]} scale={[0.95, 1.05, 0.98]}>
            <sphereGeometry args={[0.12, 28, 20]} />
            <Clay color={HAIR} rough={0.9} />
          </mesh>
        </group>
        {/* Arms down to the keyboard */}
        {[-1, 1].map((s, i) => (
          <group key={s} ref={(el) => void (arms.current[i] = el)} position={[0, 0.44, 0]}>
            <mesh position={[0, 0, s * 0.19]}>
              <sphereGeometry args={[0.07, 16, 12]} />
              <Clay color={SWEATER} />
            </mesh>
            <Limb from={[0, 0, s * 0.2]} to={[-0.16, -0.24, s * 0.24]} r={0.06} color={SWEATER} />
            <Limb from={[-0.16, -0.24, s * 0.24]} to={[-0.74, -0.22, s * 0.13]} r={0.052} color={SWEATER} />
            <mesh position={[-0.8, -0.22, s * 0.12]} scale={[1.3, 0.7, 1]}>
              <sphereGeometry args={[0.045, 14, 12]} />
              <Clay color={SKIN} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/** Tiny deterministic random, so the mess is the same on every visit. */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const noteTones = [C.butter, C.butter, C.peach, C.sage, C.sky, C.lilac];

interface Note {
  pos: THREE.Vector3;
  rot: THREE.Quaternion;
  tone: number;
  leave: number;
}

/** Sticky notes on every surface: the floor, the walls, the desk and the sideboard. */
function scatterNotes() {
  const r = rng(11);
  const flat = (yaw: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, yaw));
  const onBack = (tilt: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, tilt));
  const onLeft = (tilt: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, tilt));
  const out: Omit<Note, "leave">[] = [];
  const add = (x: number, y: number, z: number, rot: THREE.Quaternion) => out.push({ pos: new THREE.Vector3(x, y, z), rot, tone: Math.floor(r() * noteTones.length) });
  for (let i = 0; i < 12; i++) add(lerp(-1.6, 2.9, r()), 0.03 + i * 0.001, lerp(-1.0, 2.4, r()), flat(r() * Math.PI * 2));
  for (let i = 0; i < 7; i++) add(lerp(-2.7, 0.1, r()), lerp(0.5, 2.5, r()), BACK + 0.07, onBack((r() - 0.5) * 0.6));
  for (let i = 0; i < 5; i++) add(LEFT + 0.012, lerp(1.0, 2.4, r()), lerp(-1.3, 0.9, r()), onLeft((r() - 0.5) * 0.6));
  for (let i = 0; i < 4; i++) add(lerp(DESK.x - 0.25, DESK.x + 0.3, r()), DESK.top + 0.008 + i * 0.002, DESK.z + lerp(-0.8, 0.8, r()), flat(r() * Math.PI * 2));
  for (let i = 0; i < 3; i++) add(lerp(0.6, 2.4, r()), SIDEBOARD.h + 0.008 + i * 0.002, BACK + lerp(0.2, 0.6, r()), flat(r() * Math.PI * 2));
  // Leave in a shuffled order, spread across the middle chapters.
  const order = out.map((_, i) => i).sort(() => r() - 0.5);
  return out.map((n, i) => ({ ...n, leave: 0.34 + 0.38 * (order.indexOf(i) / out.length) }));
}

const HEAD_NOTES = 12;
const FLIGHT = 0.08;
const facingScreen = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));

/** Moves a note toward the screen along an arc; returns false once it's gone in. */
function fly(o: THREE.Object3D, from: THREE.Vector3, fromRot: THREE.Quaternion, e: number, size: number, arc: number) {
  if (e >= 1) {
    o.visible = false;
    return false;
  }
  o.visible = true;
  const k = smooth(e);
  o.position.lerpVectors(from, SCREEN, k);
  o.position.y += Math.sin(k * Math.PI) * arc;
  o.quaternion.slerpQuaternions(fromRot, facingScreen, k);
  o.scale.setScalar(Math.max(0.0001, size * (1 - smooth(segment(e, 0.7, 1)))));
  return true;
}

/** Room notes and the little ones circling the person's head, all heading into the computer. */
function Notes({ p, onArrived }: { p: ProgressRef; onArrived: (share: number) => void }) {
  const notes = useMemo(() => scatterNotes(), []);
  const textures = useMemo(() => noteTones.map((t) => stickyNote(t)), []);
  const roomRefs = useRef<(THREE.Mesh | null)[]>([]);
  const headRefs = useRef<(THREE.Mesh | null)[]>([]);
  const orbit = useMemo(() => new THREE.Vector3(), []);
  const spin = useMemo(() => new THREE.Quaternion(), []);
  const euler = useMemo(() => new THREE.Euler(), []);

  useFrame(({ clock }) => {
    const t = p.current;
    const time = clock.elapsedTime;
    let arrived = 0;
    notes.forEach((n, i) => {
      const o = roomRefs.current[i];
      if (o && !fly(o, n.pos, n.rot, segment(t, n.leave, n.leave + FLIGHT), 1, 0.7)) arrived++;
    });
    headRefs.current.forEach((o, i) => {
      if (!o) return;
      // A busy little swirl of thoughts, until each one leaves for the screen.
      const a = (i / HEAD_NOTES) * Math.PI * 2 + time * (0.5 + (i % 3) * 0.12);
      const rad = 0.36 + 0.08 * Math.sin(i * 1.7);
      orbit.set(HEAD.x + Math.cos(a) * rad, HEAD.y + 0.36 + 0.1 * Math.sin(time * 1.5 + i), HEAD.z + Math.sin(a) * rad);
      spin.setFromEuler(euler.set(Math.sin(time + i) * 0.4, -a, Math.cos(time * 0.8 + i) * 0.3));
      const leave = 0.16 + 0.32 * (i / HEAD_NOTES);
      if (!fly(o, orbit, spin, segment(t, leave, leave + FLIGHT), 1, 0.25)) arrived++;
    });
    onArrived(arrived / (notes.length + HEAD_NOTES));
  });

  return (
    <>
      {notes.map((n, i) => (
        <mesh key={i} ref={(el) => void (roomRefs.current[i] = el)} position={n.pos} quaternion={n.rot}>
          <boxGeometry args={[0.26, 0.26, 0.008]} />
          <meshStandardMaterial map={textures[n.tone]} roughness={0.85} />
        </mesh>
      ))}
      {Array.from({ length: HEAD_NOTES }, (_, i) => (
        <mesh key={i} ref={(el) => void (headRefs.current[i] = el)} userData={{ noShadow: true }}>
          <boxGeometry args={[0.15, 0.15, 0.005]} />
          <meshStandardMaterial map={textures[i % textures.length]} roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}

/** Desk, person, computer and notes. The screen fills up with people as the notes go in. */
function Workspace({ p }: { p: ProgressRef }) {
  const screen = useMemo(() => appScreen(), []);
  const glow = useRef<THREE.PointLight>(null);
  const onArrived = (share: number) => {
    screen.draw(Math.round(share * 7));
    if (glow.current) glow.current.intensity = 0.3 + share * 1.2;
  };
  return (
    <>
      <Desk />
      <Monitor glow={glow} />
      <Screen tex={screen.tex} />
      <group position={[CHAIR_X, 0, DESK.z]} rotation={[0, SEAT_TURN, 0]}>
        <Chair />
        <Person p={p} />
      </group>
      <Notes p={p} onArrived={onArrived} />
    </>
  );
}

const leaves = Array.from({ length: 7 }, (_, i) => ({
  a: (i / 7) * Math.PI * 2 + (i % 2) * 0.3,
  tilt: 0.5 + (i % 3) * 0.25,
  h: 0.75 + ((i * 5) % 4) * 0.12,
}));

function Plant() {
  return (
    <group position={[W / 2 - 0.4, 0, BACK + 0.45]}>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.24, 0.18, 0.4, 28]} />
        <Clay color={C.terracotta} rough={0.7} />
      </mesh>
      <mesh position={[0, 0.39, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.02, 28]} />
        <Clay color={C.bark} rough={1} />
      </mesh>
      {leaves.map((l, i) => (
        <group key={i} position={[0, 0.38, 0]} rotation={[0, l.a, 0]}>
          <mesh position={[0, l.h / 2, 0.12]} rotation={[0.25, 0, 0]}>
            <cylinderGeometry args={[0.012, 0.015, l.h, 6]} />
            <Clay color={C.leaf} />
          </mesh>
          <mesh position={[0, l.h, 0.3]} rotation={[l.tilt, 0, 0]} scale={[0.26, 0.03, 0.34]}>
            <sphereGeometry args={[1, 20, 14]} />
            <Clay color={C.leaf} rough={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function FloorLamp({ p }: { p: ProgressRef }) {
  const bulb = useRef<THREE.MeshStandardMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame(() => {
    const on = smooth(segment(p.current, 0.78, 0.86));
    if (bulb.current) bulb.current.emissiveIntensity = on * 4;
    if (light.current) light.current.intensity = on * 3;
  });
  return (
    <group position={[LEFT + 0.38, 0, 1.95]}>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.2, 0.22, 0.04, 28]} />
        <Clay color={C.ink} rough={0.4} />
      </mesh>
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 1.6, 10]} />
        <Clay color={C.ink} rough={0.4} />
      </mesh>
      <mesh position={[0, 1.72, 0]}>
        <cylinderGeometry args={[0.16, 0.28, 0.3, 32, 1, true]} />
        <meshStandardMaterial ref={bulb} color={C.cream} emissive={C.warm} emissiveIntensity={0} side={THREE.DoubleSide} roughness={0.8} toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0, 1.55, 0]} color={C.warm} intensity={0} distance={4} decay={2} />
    </group>
  );
}

const frames = [
  { x: -2.3, bg: C.peach, fig: "#c98b66" },
  { x: -1.55, bg: C.sky, fig: "#7f9ab7" },
  { x: -0.8, bg: C.sage, fig: "#869d6b" },
];

/** Photos of your people on the back wall, buried under notes at first. Each one warms up in turn once it's clear. */
function Photos({ p }: { p: ProgressRef }) {
  const pics = useMemo(() => frames.map((f) => portrait(f.bg, f.fig)), []);
  const mats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const lamps = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const faded = useMemo(() => new THREE.Color("#8d857b"), []);
  const white = useMemo(() => new THREE.Color("#ffffff"), []);
  useFrame(() => {
    frames.forEach((_, i) => {
      const on = smooth(segment(p.current, 0.8 + i * 0.04, 0.85 + i * 0.04));
      mats.current[i]?.color.lerpColors(faded, white, on);
      if (mats.current[i]) mats.current[i]!.emissiveIntensity = on * 0.35;
      if (lamps.current[i]) lamps.current[i]!.emissiveIntensity = on * 5;
    });
  });
  return (
    <group position={[0, 0, BACK + 0.03]}>
      {frames.map((f, i) => (
        <group key={f.x} position={[f.x, 1.78 + (i === 1 ? 0.1 : 0), 0]}>
          <RoundedBox args={[0.58, 0.72, 0.05]} radius={0.02}>
            <Clay color="#ffffff" rough={0.5} />
          </RoundedBox>
          <mesh position={[0, 0, 0.027]}>
            <planeGeometry args={[0.46, 0.6]} />
            <meshStandardMaterial ref={(m) => void (mats.current[i] = m)} map={pics[i]} emissiveMap={pics[i]} emissive="#ffffff" emissiveIntensity={0} color={faded} roughness={0.6} />
          </mesh>
          {/* Picture light */}
          <mesh position={[0, 0.46, 0.07]} rotation={[0, 0, Math.PI / 2]} userData={{ noShadow: true }}>
            <capsuleGeometry args={[0.02, 0.28, 4, 10]} />
            <meshStandardMaterial ref={(m) => void (lamps.current[i] = m)} color="#b9a588" emissive={C.warm} emissiveIntensity={0} metalness={0.4} roughness={0.4} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Where the camera looks in each chapter, and how close. Kept wide so the room reads as a model. */
const shots = [
  { at: 0.0, target: new THREE.Vector3(0.3, 0.9, 0.3), zoom: 0.95 },
  { at: 0.3, target: new THREE.Vector3(-1.6, 1.2, -0.1), zoom: 1.3 },
  { at: 0.56, target: new THREE.Vector3(0, 0.95, 0.1), zoom: 1.05 },
  { at: 0.8, target: new THREE.Vector3(0.3, 0.9, 0.3), zoom: 0.95 },
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

    // Stays close to a true isometric angle so both walls always read as a cutaway.
    const az = THREE.MathUtils.degToRad(44 + (t - 0.5) * 10);
    const el = THREE.MathUtils.degToRad(32);
    const r = 16;
    camera.position.set(target.x + r * Math.cos(el) * Math.sin(az), target.y + r * Math.sin(el), target.z + r * Math.cos(el) * Math.cos(az));
    camera.lookAt(target);
    const ortho = camera as THREE.OrthographicCamera;
    const base = size.width < 640 ? Math.min(size.width / 9, size.height / 5.6) : Math.min(size.width / 11, size.height / 7.4);
    ortho.zoom = base * (size.width < 640 ? Math.min(zoomMul, 1.2) : zoomMul);
    // On wide screens the canvas spans the whole section; push the room right of the text.
    if (size.width >= 1024) ortho.setViewOffset(size.width, size.height, -size.width * 0.21, 0, size.width, size.height);
    else ortho.clearViewOffset();
    ortho.updateProjectionMatrix();

    const dusk = duskAt(t);
    if (key.current) key.current.intensity = lerp(1.9, 0.6, dusk);
    if (hemi.current) hemi.current.intensity = lerp(0.6, 0.28, dusk);
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={["#fff3e2", "#4a3220", 0.6]} />
      {/* Sun from the front right, so the walls catch shadows like a model on a desk. */}
      <directionalLight
        ref={key}
        position={[6, 10, 7]}
        intensity={1.9}
        color="#ffe6c8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={1}
        shadow-camera-far={32}
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
      <fog attach="fog" args={[SCENE_BG, 18, 34]} />
      <Rig p={p} />
      {/* Soft studio fill from above and the sides; no HDR file needed. */}
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={1.5} color="#ffeedb" position={[0, 6, 2]} scale={[10, 4, 1]} rotation-x={Math.PI / 2} />
        <Lightformer form="rect" intensity={0.8} color="#ffd9b0" position={[6, 2, 3]} scale={[4, 3, 1]} rotation-y={-Math.PI / 2} />
        <Lightformer form="rect" intensity={0.5} color="#c8d8ff" position={[2, 2, 6]} scale={[4, 3, 1]} />
      </Environment>
      <group ref={root}>
        <Room p={p} />
        <Photos p={p} />
        <Plant />
        <FloorLamp p={p} />
        <Sideboard />
        <Workspace p={p} />
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
