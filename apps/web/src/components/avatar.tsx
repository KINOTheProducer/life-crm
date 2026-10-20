import { cn } from "@/lib/utils";

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

/** Photo when we have one (Immich, later), otherwise initials on the person's pastel. */
export function Avatar({
  id,
  name,
  src,
  size = 40,
  className,
}: {
  id: string;
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" style={style} className={cn("shrink-0 rounded-full object-cover", className)} />;
  }
  return (
    <span
      aria-hidden
      style={style}
      className={cn("grid shrink-0 place-items-center rounded-full font-medium text-foreground/75", toneFor(id), className)}
    >
      {initials(name)}
    </span>
  );
}
