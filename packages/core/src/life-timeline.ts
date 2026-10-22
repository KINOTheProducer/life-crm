/** Bars for the life timeline: when each person came into your life and, if they did, when they left it. */

/** A stretch of time someone was in your life. No end means it's still going. */
export interface Period {
  startYear: number | null;
  startMonth: number | null;
  endYear: number | null;
  endMonth: number | null;
}

export interface SpanInput {
  /** When you've known them. Empty when you never said. */
  periods: Period[];
  /** Their birth year when they're family: they've been in your life since then (or since you were born). */
  familyBirthYear: number | null;
  isFamily: boolean;
  selfBirthYear: number | null;
  firstInteractionYear: number | null;
  addedYear: number;
  deathYear: number | null;
}

export interface Span {
  start: number;
  end: number;
  /** True when we inferred the start rather than being told when you met. */
  startGuessed: boolean;
  ended: "lost_touch" | "died" | null;
  /** Years out of touch between periods: the bar is drawn up to `from` and again from `to`. */
  gaps: { from: number; to: number }[];
}

const byStart = (a: Period, b: Period) => (a.startYear ?? -Infinity) - (b.startYear ?? -Infinity) || (a.startMonth ?? 0) - (b.startMonth ?? 0);

export function lifeSpan(p: SpanInput, currentYear: number): Span {
  const periods = [...p.periods].sort(byStart);
  const first = periods[0];
  const last = periods.at(-1);
  let start: number;
  let startGuessed = false;
  if (first?.startYear != null) start = first.startYear;
  else {
    startGuessed = true;
    const familyStart = p.isFamily ? Math.max(p.familyBirthYear ?? -Infinity, p.selfBirthYear ?? -Infinity) : -Infinity;
    start = Number.isFinite(familyStart) ? familyStart : Math.min(p.firstInteractionYear ?? p.addedYear, p.addedYear);
    // Lost touch without saying when you met: it started no later than that.
    if (first?.endYear != null) start = Math.min(start, first.endYear);
  }
  start = Math.min(start, currentYear);

  const closed = last?.endYear != null;
  let end = Math.min(closed ? last!.endYear! : Infinity, p.deathYear ?? Infinity, currentYear);
  end = Math.max(end, start);
  const ended = p.deathYear != null ? "died" : closed ? "lost_touch" : null;

  const gaps: Span["gaps"] = [];
  for (let i = 1; i < periods.length; i++) {
    const from = periods[i - 1]!.endYear;
    const to = periods[i]!.startYear;
    if (from != null && to != null && to > from + 1 && to <= end) gaps.push({ from, to });
  }
  return { start, end, startGuessed, ended, gaps };
}

/** Compare two points; months only count when both sides have one. */
function compare(a: { year: number; month: number | null }, b: { year: number; month: number | null }) {
  if (a.year !== b.year) return a.year - b.year;
  return a.month != null && b.month != null ? a.month - b.month : 0;
}

export interface PeriodProblem {
  /** Index into the periods as given. */
  index: number;
  message: string;
}

const yearMonth = (year: number, month: number | null) => (month ? `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1]} ${year}` : String(year));

/** Describe a period, e.g. "2005 to Mar 2012" or "2020 to now". */
export function periodLabel(p: Period): string {
  const from = p.startYear != null ? yearMonth(p.startYear, p.startMonth) : "?";
  return `${from} to ${p.endYear != null ? yearMonth(p.endYear, p.endMonth) : "now"}`;
}

/**
 * The first thing wrong with a set of periods, or null: each needs a start, can't end before it
 * starts or be in the future, only the latest can still be going, and none can overlap.
 */
export function periodsProblem(periods: Period[], now: { year: number; month: number }): PeriodProblem | null {
  const nowPoint = { year: now.year, month: now.month };
  for (const [index, p] of periods.entries()) {
    if (p.startYear == null) return { index, message: "Add when it started" };
    const start = { year: p.startYear, month: p.startMonth };
    if (compare(start, nowPoint) > 0) return { index, message: "That start hasn't happened yet" };
    if (p.endYear == null) continue;
    const end = { year: p.endYear, month: p.endMonth };
    if (compare(end, nowPoint) > 0) return { index, message: "That end hasn't happened yet" };
    if (compare(end, start) < 0) return { index, message: "Ends before it starts" };
  }
  const order = periods.map((p, index) => ({ p, index })).sort((a, b) => byStart(a.p, b.p));
  for (let i = 1; i < order.length; i++) {
    const prev = order[i - 1]!;
    const cur = order[i]!;
    if (prev.p.endYear == null) return { index: prev.index, message: "Only the latest period can go on to now. Add when this one ended" };
    if (compare({ year: cur.p.startYear!, month: cur.p.startMonth }, { year: prev.p.endYear, month: prev.p.endMonth }) < 0) {
      return { index: cur.index, message: `Overlaps with ${periodLabel(prev.p)}` };
    }
  }
  return null;
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
