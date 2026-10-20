"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect } from "react";
import { thumbUrl } from "@/lib/immich-urls";

/** Full-screen Immich preview with arrow-key and click navigation. */
export function Lightbox({ assetIds, index, onChange }: { assetIds: string[]; index: number | null; onChange: (i: number | null) => void }) {
  useEffect(() => {
    if (index == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onChange(null);
      if (e.key === "ArrowRight") onChange(Math.min(index + 1, assetIds.length - 1));
      if (e.key === "ArrowLeft") onChange(Math.max(index - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, assetIds.length, onChange]);

  const current = index != null ? assetIds[index] : null;
  if (current == null || index == null) return null;
  return (
    <div role="dialog" aria-modal aria-label="Photo" className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-6" onClick={() => onChange(null)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- proxied Immich preview */}
      <img src={thumbUrl(current, "preview")} alt="" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
      <button type="button" aria-label="Close" className="absolute top-5 right-5 rounded-full p-2 text-white/80 hover:text-white" onClick={() => onChange(null)}>
        <X className="size-6" />
      </button>
      {index > 0 && (
        <button
          type="button"
          aria-label="Previous"
          className="absolute left-4 rounded-full p-2 text-white/80 hover:text-white"
          onClick={(e) => {
            e.stopPropagation();
            onChange(index - 1);
          }}
        >
          <ChevronLeft className="size-8" />
        </button>
      )}
      {index < assetIds.length - 1 && (
        <button
          type="button"
          aria-label="Next"
          className="absolute right-4 rounded-full p-2 text-white/80 hover:text-white"
          onClick={(e) => {
            e.stopPropagation();
            onChange(index + 1);
          }}
        >
          <ChevronRight className="size-8" />
        </button>
      )}
    </div>
  );
}
