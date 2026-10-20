"use client";

import { Mic, Square, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_MS = 5 * 60 * 1000;
const BARS = 48;

type Phase = "idle" | "recording" | "uploading";

function pickMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function VoiceRecorder({ contextContactId, contextName }: { contextContactId?: string; contextName?: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const cleanup = useRef<() => void>(() => {});
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => cleanup.current(), []);

  async function upload(blob: Blob, durationMs: number | null) {
    setPhase("uploading");
    const form = new FormData();
    form.set("audio", blob, "note");
    if (durationMs != null) form.set("durationMs", String(Math.round(durationMs)));
    if (contextContactId) form.set("contextContactId", contextContactId);
    const res = await fetch("/api/captures", { method: "POST", body: form });
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok || !body.id) {
      setError(body.error ?? "Upload failed");
      setPhase("idle");
      return;
    }
    router.push(`/capture/${body.id}`);
  }

  async function start() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access was blocked. Allow it in your browser and try again.");
      return;
    }
    const mimeType = pickMimeType();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
    rec.onstop = () => {
      const duration = performance.now() - startedAt.current;
      cleanup.current();
      void upload(new Blob(chunks.current, { type: rec.mimeType || "audio/webm" }), duration);
    };

    // Live level meter.
    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
      setLevels((prev) => [...prev.slice(1), Math.min(1, peak * 2.5)]);
      const now = performance.now() - startedAt.current;
      setElapsed(now);
      if (now >= MAX_MS && rec.state === "recording") rec.stop();
      raf = requestAnimationFrame(tick);
    };

    cleanup.current = () => {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      void audioCtx.close().catch(() => {});
    };

    recorder.current = rec;
    startedAt.current = performance.now();
    rec.start(1000);
    setPhase("recording");
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  const recording = phase === "recording";

  return (
    <div className="grid justify-items-center gap-8 py-6 text-center">
      <p className="type-meta text-muted-foreground">
        {phase === "uploading" ? "Uploading…" : recording ? formatElapsed(elapsed) : contextName ? `About ${contextName}` : "New voice note"}
      </p>

      <button
        type="button"
        onClick={recording ? stop : start}
        disabled={phase === "uploading"}
        aria-label={recording ? "Stop recording" : "Start recording"}
        className={cn(
          "relative grid size-36 place-items-center rounded-full bg-accent text-accent-foreground shadow-[inset_0_-4px_0_rgb(0_0_0/0.15)] transition-transform outline-none focus-visible:ring-4 focus-visible:ring-ring/50 active:scale-95 disabled:opacity-50",
          recording && "bg-primary text-primary-foreground",
        )}
      >
        {recording && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-accent/30" />}
        {recording ? <Square className="size-10 fill-current" /> : <Mic className="size-12" />}
      </button>

      <div aria-hidden className="flex h-12 items-center gap-[3px]">
        {levels.map((l, i) => (
          <span
            key={i}
            className={cn("w-1 rounded-full transition-[height] duration-75", recording ? "bg-accent" : "bg-foreground/15")}
            style={{ height: `${Math.max(4, l * 48)}px` }}
          />
        ))}
      </div>

      <p className="max-w-md text-muted-foreground">
        {recording
          ? "Talk naturally. Names, birthdays, what you did together, what to ask about next time."
          : "Tap the button and talk about someone. You'll review everything before it's saved."}
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!recording && (
        <>
          <input
            ref={fileInput}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file, null);
            }}
          />
          <Button variant="ghost" size="sm" disabled={phase === "uploading"} onClick={() => fileInput.current?.click()}>
            <Upload />
            Upload an audio file
          </Button>
        </>
      )}
    </div>
  );
}
