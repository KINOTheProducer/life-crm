/** Bars for the life timeline: when each person came into your life and, if they did, when they left it. */

export interface SpanInput {
  metYear: number | null;
  /** Their birth year when they're family: they've been in your life since then (or since you were born). */
  familyBirthYear: number | null;
  isFamily: boolean;
  selfBirthYear: number | null;
  firstInteractionYear: number | null;
  addedYear: number;
  lostTouchYear: number | null;
  deathYear: number | null;
}

export interface Span {
  start: number;
  end: number;
  /** True when we inferred the start rather than being told when you met. */
  startGuessed: boolean;
  ended: "lost_touch" | "died" | null;
}

export function lifeSpan(p: SpanInput, currentYear: number): Span {
  let start: number;
  let startGuessed = false;
  if (p.metYear != null) start = p.metYear;
  else {
    startGuessed = true;
    const familyStart = p.isFamily ? Math.max(p.familyBirthYear ?? -Infinity, p.selfBirthYear ?? -Infinity) : -Infinity;
    start = Number.isFinite(familyStart) ? familyStart : Math.min(p.firstInteractionYear ?? p.addedYear, p.addedYear);
  }
  const ended = p.deathYear != null ? "died" : p.lostTouchYear != null ? "lost_touch" : null;
  let end = Math.min(p.lostTouchYear ?? Infinity, p.deathYear ?? Infinity, currentYear);
  if (!Number.isFinite(end)) end = currentYear;
  start = Math.min(start, currentYear);
  return { start, end: Math.max(end, start), startGuessed, ended };
}

/** Axis labels: every year for short spans, then every 2, 5 or 10. */
export function yearTicks(from: number, to: number): number[] {
  const span = to - from;
  const step = span <= 12 ? 1 : span <= 24 ? 2 : span <= 60 ? 5 : 10;
  const ticks: number[] = [];
  for (let y = Math.ceil(from / step) * step; y <= to; y += step) ticks.push(y);
  return ticks;
}

/** 0 to 1 shade for a year's contact count, on a square-root scale so one busy year doesn't wash out the rest. */
export function contactShade(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.sqrt(count) / Math.sqrt(max);
}
