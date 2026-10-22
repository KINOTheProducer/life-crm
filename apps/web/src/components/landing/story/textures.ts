import * as THREE from "three";
import { APP_NAME } from "@/lib/brand";

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

const entries = [
  { name: "Daniel Okafor", detail: "Chef at Bar Isabel now", badge: "Birthday Oct 24", tone: "#f4c3a1" },
  { name: "Maya Chen", detail: "Moved to Montreal in May", badge: null, tone: "#bed6ee" },
  { name: "Priya Shah", detail: "Two kids, Arjun and Leela", badge: null, tone: "#c4d8ae" },
  { name: "Sam Rivera", detail: "Training for the Toronto marathon", badge: "Catch up", tone: "#d6c8f0" },
  { name: "Leo Martin", detail: "Started a new job in March", badge: null, tone: "#f3df98" },
  { name: "Nora Bell", detail: "Getting married next June", badge: "Save the date", tone: "#f2b8c0" },
  { name: "Theo Park", detail: "Loves gardening, allergic to cats", badge: null, tone: "#bed6ee" },
  { name: "Marcus Reid", detail: "Just had a baby girl, Ivy", badge: "Send a gift", tone: "#f4c3a1" },
  { name: "Ana Souza", detail: "Back from Lisbon, has photos", badge: null, tone: "#c4d8ae" },
  { name: "Ben Carter", detail: "Thinking about getting a dog", badge: "Birthday Nov 3", tone: "#d6c8f0" },
];

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("");

/** The page's own fonts, so the screen matches the real app once they've loaded. */
function fontStack(variable: string, fallback: string) {
  const v = typeof document === "undefined" ? "" : getComputedStyle(document.body).getPropertyValue(variable).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

/**
 * The People page on the monitor. `share` (0..1) is how much has landed; each new person slides
 * in at the top and pushes the rest down.
 */
export function appScreen() {
  const W = 1120;
  const H = 640;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  let shown = -1;

  const draw = (share: number) => {
    const q = Math.round(share * 400) / 400;
    if (q === shown) return;
    shown = q;
    const sans = fontStack("--font-geist-sans", "ui-sans-serif, system-ui, sans-serif");
    const serif = fontStack("--font-display-serif", "Georgia, serif");
    const total = q * entries.length;
    const count = Math.floor(total);
    const grow = total - count;

    ctx.fillStyle = "#f2efe9";
    ctx.fillRect(0, 0, W, H);

    // Sidebar
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, 18, 18, 150, H - 36, 22);
    ctx.fillStyle = "#14120f";
    ctx.font = `italic 300 40px ${serif}`;
    ctx.fillText(APP_NAME, 40, 74);
    ctx.font = `400 21px ${sans}`;
    ["Today", "People", "Family", "Reminders"].forEach((label, i) => {
      const y = 136 + i * 52;
      if (label === "People") {
        ctx.fillStyle = "#f2efe9";
        roundRect(ctx, 30, y - 30, 126, 44, 22);
      }
      ctx.fillStyle = label === "People" ? "#14120f" : "#6f6a63";
      ctx.fillText(label, 46, y);
    });

    // Header
    const people = count + (grow > 0.5 ? 1 : 0);
    ctx.fillStyle = "#14120f";
    ctx.font = `300 64px ${serif}`;
    ctx.fillText("People.", 196, 92);
    const title = ctx.measureText("People. ").width;
    ctx.fillStyle = "#6f6a63";
    ctx.font = `italic 300 64px ${serif}`;
    ctx.fillText(people === 0 ? "No one yet." : `${people} so far.`, 196 + title, 92);

    // Rows, newest on top. The newest grows in from nothing and pushes the rest down.
    const rowH = 98;
    const gap = 14;
    ctx.save();
    ctx.beginPath();
    ctx.rect(186, 118, W - 200, H - 132);
    ctx.clip();
    let y = 122;
    const visible = Math.min(entries.length, count + (grow > 0 ? 1 : 0));
    for (let n = visible - 1; n >= 0; n--) {
      const e = entries[n]!;
      const isNew = n === count && grow > 0;
      const k = isNew ? grow * grow * (3 - 2 * grow) : 1;
      const h = rowH * k;
      ctx.globalAlpha = k;
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, 196, y, W - 220, h, 20);
      if (k > 0.4) {
        const cy = y + h / 2;
        ctx.fillStyle = e.tone;
        ctx.beginPath();
        ctx.arc(246, cy, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#14120f";
        ctx.font = `500 22px ${sans}`;
        ctx.textAlign = "center";
        ctx.fillText(initials(e.name), 246, cy + 8);
        ctx.textAlign = "left";
        ctx.font = `500 32px ${sans}`;
        ctx.fillText(e.name, 296, cy - 6);
        ctx.fillStyle = "#6f6a63";
        ctx.font = `400 24px ${sans}`;
        ctx.fillText(e.detail, 296, cy + 28);
        // Just-saved people get a "New" tag for a moment.
        const fresh = n >= count - 1;
        const tag = fresh ? "New" : e.badge;
        if (tag) {
          ctx.font = `500 22px ${sans}`;
          const tw = ctx.measureText(tag).width + 36;
          ctx.fillStyle = fresh ? "#14120f" : "#ffe3da";
          roundRect(ctx, W - 48 - tw, cy - 22, tw, 44, 22);
          ctx.fillStyle = fresh ? "#ffffff" : "#c43a1a";
          ctx.fillText(tag, W - 48 - tw + 18, cy + 8);
        }
      }
      ctx.globalAlpha = 1;
      y += h + gap * k;
    }
    ctx.restore();
    tex.needsUpdate = true;
  };
  draw(0);
  // Redraw with the real fonts once they're ready.
  void document.fonts?.ready.then(() => {
    const last = shown;
    shown = -1;
    draw(last);
  });
  return { tex, draw };
}
