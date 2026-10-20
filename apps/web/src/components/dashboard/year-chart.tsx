import type { MonthPoint } from "@/lib/data/dashboard";

const W = 640;
const H = 130;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;

/** Smooth line through points (Catmull-Rom converted to cubic Béziers). */
function smoothPath(points: [number, number][]) {
  if (points.length < 2) return "";
  let d = `M${points[0]![0]} ${points[0]![1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    // Keep control points between the two ends so the curve never overshoots below zero.
    const lo = Math.min(p1[1], p2[1]);
    const hi = Math.max(p1[1], p2[1]);
    const clamp = (v: number) => Math.min(hi, Math.max(lo, v));
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, clamp(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, clamp(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0]!.toFixed(1)} ${c1[1]!.toFixed(1)}, ${c2[0]!.toFixed(1)} ${c2[1]!.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export function YearChart({ months }: { months: MonthPoint[] }) {
  const max = Math.max(4, ...months.map((m) => Math.max(m.inPerson, m.remote)));
  const step = W / (months.length - 1);
  const y = (v: number) => PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) * (1 - v / max);
  const line = (key: "inPerson" | "remote") => smoothPath(months.map((m, i) => [i * step, y(m[key])]));
  const last = months.length - 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label="Catch-ups per month over the last year">
      {[0.25, 0.6, 1].map((f) => (
        <line key={f} x1={0} x2={W} y1={PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) * f} y2={PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) * f} stroke="var(--line)" />
      ))}
      <path d={line("inPerson")} fill="none" stroke="var(--ink)" strokeWidth={1.75} />
      <path d={line("remote")} fill="none" stroke="var(--coral)" strokeWidth={1.75} />
      <circle cx={last * step} cy={y(months[last]!.inPerson)} r={3.5} fill="var(--ink)" />
      <circle cx={last * step} cy={y(months[last]!.remote)} r={3.5} fill="var(--coral)" />
      {months.map((m, i) =>
        i % 2 === 0 ? (
          <text key={m.label + i} x={i * step} y={H - 4} fontSize={9.5} fill="var(--muted-ink)" className="font-mono uppercase" textAnchor={i === 0 ? "start" : "middle"}>
            {m.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}
