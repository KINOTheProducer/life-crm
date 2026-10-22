import * as THREE from "three";

/** Small canvas-drawn textures, so the scene needs no image or font downloads. */

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/** Soft radial pool of light for the ground under the room. */
export function glowPool() {
  return canvasTexture(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,200,140,0.9)");
    g.addColorStop(0.45, "rgba(255,170,100,0.35)");
    g.addColorStop(1, "rgba(255,150,80,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
}

/** Framed photo stand-in: a pastel backdrop and a head-and-shoulders silhouette. */
export function portrait(bg: string, figure: string) {
  return canvasTexture(256, 320, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 320);
    ctx.fillStyle = figure;
    ctx.beginPath();
    ctx.arc(128, 134, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(128, 330, 100, 118, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  });
}

/** Sticky note with a few scribbled lines. */
export function stickyNote(tone: string) {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = tone;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "rgba(43,39,35,0.55)";
    [70, 92, 54].forEach((w, i) => roundRect(ctx, 18, 30 + i * 26, w, 7, 3.5));
  });
}

const rowTones = ["#f4c3a1", "#bed6ee", "#c4d8ae", "#d6c8f0", "#f3df98", "#f2b8c0", "#f4c3a1"];

/** The app on the monitor. Redraws as notes arrive and become people rows. */
export function appScreen() {
  const canvas = document.createElement("canvas");
  canvas.width = 560;
  canvas.height = 320;
  const ctx = canvas.getContext("2d")!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  let shown = -1;
  const draw = (rows: number) => {
    if (rows === shown) return;
    shown = rows;
    ctx.fillStyle = "#f2efe9";
    ctx.fillRect(0, 0, 560, 320);
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, 16, 16, 116, 288, 14);
    ctx.fillStyle = "#e7e2da";
    for (let i = 0; i < 5; i++) roundRect(ctx, 32, 44 + i * 28, i === 0 ? 70 : 84, 10, 5);
    ctx.fillStyle = "#14120f";
    ctx.font = "300 30px Georgia, 'Times New Roman', serif";
    ctx.fillText("Your people", 152, 54);
    for (let i = 0; i < rows; i++) {
      const y = 72 + i * 32;
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, 152, y, 392, 26, 8);
      ctx.fillStyle = rowTones[i % rowTones.length]!;
      ctx.beginPath();
      ctx.arc(170, y + 13, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#14120f";
      roundRect(ctx, 186, y + 7, 70 + ((i * 23) % 40), 6, 3);
      ctx.fillStyle = "#c9c2b8";
      roundRect(ctx, 186, y + 16, 120 + ((i * 41) % 90), 4, 2);
      if (i % 3 === 0) {
        ctx.fillStyle = "#ff5a36";
        roundRect(ctx, 500, y + 8, 32, 10, 5);
      }
    }
    tex.needsUpdate = true;
  };
  draw(0);
  return { tex, draw };
}
