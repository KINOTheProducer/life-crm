import { cn } from "@/lib/utils";
import { AvatarImage } from "./avatar-image";
import { initials, toneFor } from "./avatar-tone";

export { initials, toneFor };

/** Photo when we have one (an Immich face), otherwise initials on the person's pastel. */
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
  const fallback = (
    <span
      aria-hidden
      style={style}
      className={cn("grid shrink-0 place-items-center rounded-full font-medium text-foreground/75", toneFor(id), className)}
    >
      {initials(name)}
    </span>
  );
  if (!src) return fallback;
  return <AvatarImage src={src} style={style} className={cn("shrink-0 rounded-full object-cover", className)} fallback={fallback} />;
}
