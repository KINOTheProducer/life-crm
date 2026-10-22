import * as THREE from "three";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";

/**
 * Sculpts soft, clay-like shapes by melting simple primitives together (signed distance fields
 * with a smooth union) and meshing the result once. Used for the model figure at the desk, which
 * needs to read as one smooth body rather than a stack of spheres and tubes.
 */

type V3 = [number, number, number];

export type Part =
  | { kind: "cone"; a: V3; b: V3; ra: number; rb: number; color: string }
  | { kind: "blob"; c: V3; r: V3; color: string };

/** Tapered capsule between two points (iq's round cone). */
function roundCone(px: number, py: number, pz: number, a: V3, b: V3, r1: number, r2: number) {
  const bx = b[0] - a[0];
  const by = b[1] - a[1];
  const bz = b[2] - a[2];
  const l2 = bx * bx + by * by + bz * bz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const qx = px - a[0];
  const qy = py - a[1];
  const qz = pz - a[2];
  const y = qx * bx + qy * by + qz * bz;
  const z = y - l2;
  const xx = qx * l2 - bx * y;
  const xy = qy * l2 - by * y;
  const xz = qz * l2 - bz * y;
  const x2 = xx * xx + xy * xy + xz * xz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

/** Approximate distance to an ellipsoid. */
function ellipsoid(px: number, py: number, pz: number, c: V3, r: V3) {
  const x = px - c[0];
  const y = py - c[1];
  const z = pz - c[2];
  const k0 = Math.hypot(x / r[0], y / r[1], z / r[2]);
  const k1 = Math.hypot(x / (r[0] * r[0]), y / (r[1] * r[1]), z / (r[2] * r[2]));
  return k1 === 0 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
}

function distance(part: Part, x: number, y: number, z: number) {
  return part.kind === "cone" ? roundCone(x, y, z, part.a, part.b, part.ra, part.rb) : ellipsoid(x, y, z, part.c, part.r);
}

/** Polynomial smooth minimum: blends two surfaces over a width of k. */
function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/**
 * Meshes the smooth union of `parts` inside a cube centred on `center` with half-size `half`.
 * Each vertex takes the colour of the nearest part, so clothes keep crisp edges.
 */
export function sculpt(parts: Part[], center: V3, half: number, res = 64, blend = 0.05) {
  const mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, true, 400000);
  mc.isolation = 0;
  const colors = parts.map((p) => new THREE.Color(p.color));
  for (let k = 0; k < res; k++) {
    const z = center[2] + ((k - res / 2) / (res / 2)) * half;
    for (let j = 0; j < res; j++) {
      const y = center[1] + ((j - res / 2) / (res / 2)) * half;
      for (let i = 0; i < res; i++) {
        const x = center[0] + ((i - res / 2) / (res / 2)) * half;
        let d = Infinity;
        let nearest = 0;
        let best = Infinity;
        parts.forEach((part, n) => {
          const pd = distance(part, x, y, z);
          d = d === Infinity ? pd : smin(d, pd, blend);
          if (pd < best) {
            best = pd;
            nearest = n;
          }
        });
        const idx = i + j * res + k * res * res;
        // Inside is positive for the mesher.
        mc.field[idx] = -d;
        const c = colors[nearest]!;
        mc.palette[idx * 3] = c.r;
        mc.palette[idx * 3 + 1] = c.g;
        mc.palette[idx * 3 + 2] = c.b;
      }
    }
  }
  mc.update();

  const n = mc.count;
  const pos = mc.positionArray.slice(0, n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = pos[i * 3]! * half + center[0];
    pos[i * 3 + 1] = pos[i * 3 + 1]! * half + center[1];
    pos[i * 3 + 2] = pos[i * 3 + 2]! * half + center[2];
  }
  const normals = mc.normalArray.slice(0, n * 3);
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(normals[i * 3]!, normals[i * 3 + 1]!, normals[i * 3 + 2]!) || 1;
    normals[i * 3] = normals[i * 3]! / l;
    normals[i * 3 + 1] = normals[i * 3 + 1]! / l;
    normals[i * 3 + 2] = normals[i * 3 + 2]! / l;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(mc.colorArray.slice(0, n * 3), 3));
  mc.geometry.dispose();
  (mc.material as THREE.Material).dispose();
  return geometry;
}
