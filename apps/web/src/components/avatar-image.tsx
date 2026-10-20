"use client";

import { useEffect, useRef, useState } from "react";

/** Falls back to initials when the face is gone (Immich merged or deleted it, or is offline). */
export function AvatarImage({
  src,
  style,
  className,
  fallback,
}: {
  src: string;
  style: React.CSSProperties;
  className: string;
  fallback: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // The image can fail before hydration attaches onError, so check once mounted too.
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth === 0) el.dispatchEvent(new Event("error"));
  }, []);
  if (failed) return fallback;
  // eslint-disable-next-line @next/next/no-img-element -- proxied Immich face
  return <img ref={img} src={src} alt="" style={style} className={className} onError={() => setFailed(true)} />;
}
