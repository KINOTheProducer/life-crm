/** Shared scroll progress (0..1) for the story section. A ref, not state, so scrolling never re-renders React. */
export interface ProgressRef {
  current: number;
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 0..1 across [a, b] of overall progress. */
export const segment = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

export const smooth = (t: number) => t * t * (3 - 2 * t);

/** Pop-in with a little overshoot. */
export function backOut(t: number) {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
