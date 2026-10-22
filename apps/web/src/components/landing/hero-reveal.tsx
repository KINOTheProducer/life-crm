"use client";

import Image, { type StaticImageData } from "next/image";
import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Holds the hero copy back until the photo has loaded, then fades both in together, so the
 * text never sits on an empty background while the image catches up.
 */
export function HeroReveal({ src, alt, children }: { src: StaticImageData; alt: string; children: ReactNode }) {
  const [ready, setReady] = useState(false);

  // Don't hold the copy hostage to a slow or failed image.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 2500);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <Image
        src={src}
        alt={alt}
        fill
        priority
        sizes="100vw"
        onLoad={() => setReady(true)}
        onError={() => setReady(true)}
        className={cn("-z-20 object-cover object-[center_40%] transition-opacity duration-700 ease-out", ready ? "opacity-100" : "opacity-0")}
      />
      <div className={cn("transition-[opacity,translate] duration-700 ease-out", ready ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0")}>{children}</div>
    </>
  );
}
