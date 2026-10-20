const tones = ["bg-peach", "bg-sage", "bg-lilac", "bg-sky", "bg-butter", "bg-rose"] as const;

/** Stable pastel for a person, so they look the same everywhere. */
export function toneFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return tones[h % tones.length]!;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase();
}
