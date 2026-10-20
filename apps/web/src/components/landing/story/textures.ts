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

const sans = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/** Phone screen mid-recording: timer, waveform, record button. */
export function phoneScreen() {
  return canvasTexture(400, 800, (ctx) => {
    ctx.fillStyle = "#1c1916";
    ctx.fillRect(0, 0, 400, 800);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `500 26px ${sans}`;
    ctx.textAlign = "center";
    ctx.fillText("Recording", 200, 150);
    ctx.fillStyle = "#ffffff";
    ctx.font = `300 96px ${sans}`;
    ctx.fillText("0:42", 200, 260);
    const bars = [30, 70, 45, 110, 60, 140, 85, 50, 120, 70, 95, 40, 80, 55, 30];
    ctx.fillStyle = "#ff5a36";
    bars.forEach((h, i) => roundRect(ctx, 52 + i * 20, 420 - h / 2, 10, h, 5));
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    roundRect(ctx, 60, 540, 280, 54, 27);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `400 22px ${sans}`;
    ctx.fillText("“Daniel’s a chef…”", 200, 575);
    ctx.fillStyle = "#ff5a36";
    ctx.beginPath();
    ctx.arc(200, 690, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1c1916";
    roundRect(ctx, 184, 674, 32, 32, 6);
  });
}

/** Month page with the 24th circled. */
export function calendarPage() {
  return canvasTexture(512, 560, (ctx) => {
    ctx.fillStyle = "#fffdf9";
    ctx.fillRect(0, 0, 512, 560);
    ctx.fillStyle = "#ff5a36";
    ctx.fillRect(0, 0, 512, 120);
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 54px ${sans}`;
    ctx.textAlign = "center";
    ctx.fillText("OCTOBER", 256, 82);
    ctx.font = `500 26px ${sans}`;
    for (let d = 1; d <= 31; d++) {
      const i = d + 3; // month starts on a Thursday
      const x = 48 + (i % 7) * 70;
      const y = 186 + Math.floor(i / 7) * 74;
      if (d === 24) {
        ctx.fillStyle = "#ff5a36";
        ctx.beginPath();
        ctx.arc(x, y - 9, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
      } else {
        ctx.fillStyle = "#6f6a63";
      }
      ctx.fillText(String(d), x, y);
    }
  });
}

/** Soft radial pool of light for the floor under the counter. */
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
