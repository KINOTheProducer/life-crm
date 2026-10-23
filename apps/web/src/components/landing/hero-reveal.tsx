import Image, { type StaticImageData } from "next/image";
import type { ReactNode } from "react";

/**
 * Hero photo behind the landing copy. The blurred placeholder is inlined in the HTML, so the
 * background is there on first paint and sharpens once the real image arrives. The copy never
 * waits on the photo.
 */
export function HeroReveal({ src, alt, children }: { src: StaticImageData; alt: string; children: ReactNode }) {
  return (
    <>
      <Image
        src={src}
        alt={alt}
        fill
        priority
        placeholder="blur"
        sizes="100vw"
        className="-z-20 object-cover object-[center_40%]"
      />
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out">{children}</div>
    </>
  );
}
