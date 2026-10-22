"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { clamp01, type ProgressRef } from "./progress";

const StoryScene = dynamic(() => import("./scene"), { ssr: false });

const chapters = [
  { title: "It's all", aside: "in your head.", body: "Birthdays, kids' names, who just moved, who you owe a call. Sticky notes everywhere, and more you never wrote down." },
  { title: "Say it once.", aside: "", body: "Talk for thirty seconds after you see someone. Who you saw, what's new, what to remember. It goes straight in." },
  { title: "It sorts itself.", aside: "", body: "Names, birthdays, jobs and plans land on the right person. You check them before anything is saved." },
  { title: "And your head", aside: "is clear.", body: "Birthdays and catch-ups come back when they matter, so you don't have to hold on to any of it." },
];

// Where each chapter starts in overall scroll progress; matches the timings in scene.tsx.
const starts = [0, 0.25, 0.5, 0.72];

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Scroll-driven 3D story. The section is several screens tall; the canvas sticks while the
 * reader scrolls through it, and scroll position drives the scene. With reduced motion or
 * no WebGL it falls back to a plain list.
 */
export function StorySection() {
  const section = useRef<HTMLElement>(null);
  const progress: ProgressRef = useRef(0);
  const [chapter, setChapter] = useState(0);
  const [active, setActive] = useState(false);
  const [mode, setMode] = useState<"pending" | "3d" | "static">("pending");
  // Shadows-heavy postprocessing only on larger screens.
  const [rich, setRich] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Deferred so the decision isn't a synchronous state update inside the effect.
    queueMicrotask(() => {
      setMode(!reduce && supportsWebGL() ? "3d" : "static");
      setRich(window.innerWidth >= 900);
    });
  }, []);

  useEffect(() => {
    if (mode !== "3d") return;
    const el = section.current!;
    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const p = clamp01(-rect.top / total);
      progress.current = p;
      const next = starts.findLastIndex((s) => p >= s);
      setChapter((c) => (c === next ? c : next));
    };
    const io = new IntersectionObserver(([entry]) => setActive(entry!.isIntersecting), { rootMargin: "200px" });
    io.observe(el);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [mode, progress]);

  if (mode !== "3d") {
    return (
      <section id="how" className="bg-foreground text-background">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-24 md:grid-cols-2 lg:px-10">
          {chapters.map((c, i) => (
            <div key={c.title}>
              <span className="type-display text-4xl text-coral">{i + 1}</span>
              <h3 className="type-display mt-2 text-4xl">
                {c.title} {c.aside && <em className="text-background/60">{c.aside}</em>}
              </h3>
              <p className="mt-3 max-w-md text-background/75">{c.body}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section id="how" ref={section} className="relative h-[460vh] bg-[#24170d] text-background">
      <div className="sticky top-0 grid h-screen overflow-hidden lg:grid-cols-[minmax(340px,0.8fr)_1.2fr]">
        <div className="relative z-10 flex flex-col justify-end self-end bg-gradient-to-t from-[#24170d] via-[#24170d]/85 to-transparent px-6 pt-24 pb-14 lg:justify-center lg:self-auto lg:bg-none lg:pt-0 lg:pb-0 lg:pl-16">
          <p className="mb-6 font-mono text-xs text-background/50">
            {String(chapter + 1).padStart(2, "0")} / {String(chapters.length).padStart(2, "0")}
          </p>
          <div className="relative min-h-56">
            {chapters.map((c, i) => (
              <div
                key={c.title}
                aria-hidden={i !== chapter}
                className={cn(
                  "absolute inset-x-0 top-0 transition-all duration-500 ease-out",
                  i === chapter ? "translate-y-0 opacity-100" : i < chapter ? "-translate-y-6 opacity-0" : "translate-y-6 opacity-0",
                )}
              >
                <h3 className="type-display text-[2.75rem] leading-[1.02] lg:text-[3.5rem]">
                  {c.title} {c.aside && <em className="text-background/55">{c.aside}</em>}
                </h3>
                <p className="mt-4 max-w-md text-lg text-background/75">{c.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex gap-2">
            {chapters.map((c, i) => (
              <span key={c.title} className={cn("h-1 rounded-full transition-all duration-500", i === chapter ? "w-10 bg-coral" : "w-4 bg-background/25")} />
            ))}
          </div>
        </div>

        <div className="absolute inset-x-0 top-0 h-[62vh] lg:inset-0 lg:h-auto">
          <StoryScene progress={progress} active={active} rich={rich} />
        </div>
        {/* Keeps the copy readable when the camera moves in close. */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 hidden w-[52%] bg-gradient-to-r from-[#24170d] via-[#24170d]/75 to-transparent lg:block" />
      </div>
    </section>
  );
}
