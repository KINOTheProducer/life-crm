"use client";

import type { CardExtraction } from "@life-crm/ai";
import { Camera, ImagePlus, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { readCard, saveCard } from "@/app/(app)/capture/card/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSteps, WorkingSteps } from "@/components/working-steps";
import { selectClass, textareaClass } from "@/lib/forms";
import { cn } from "@/lib/utils";

type Side = "front" | "back";

/** Shrink to 1600px on the long side as JPEG: plenty for reading text, light to upload. */
async function shrink(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that image"))), "image/jpeg", 0.88));
}

function Webcam({ onShot, onClose }: { onShot: (b: Blob) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 } } })
      .then((s) => {
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setError("Couldn't open the camera. Check the browser's camera permission."));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);
  return (
    <div className="grid gap-3">
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <video ref={video} autoPlay playsInline muted className="aspect-[16/10] w-full rounded-2xl bg-black object-cover" />
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={!!error}
          onClick={() => {
            const v = video.current;
            if (!v || !v.videoWidth) return;
            const c = document.createElement("canvas");
            c.width = v.videoWidth;
            c.height = v.videoHeight;
            c.getContext("2d")!.drawImage(v, 0, 0);
            c.toBlob((b) => b && onShot(b), "image/jpeg", 0.92);
          }}
        >
          <Camera />
          Take photo
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function CardScanner() {
  const [images, setImages] = useState<Partial<Record<Side, { blob: Blob; url: string }>>>({});
  const [camera, setCamera] = useState<Side | null>(null);
  const [result, setResult] = useState<{ card: CardExtraction; match: { id: string; name: string } | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, startRead] = useTransition();
  const steps = useSteps(
    [
      images.back ? "Reading the front and back of the card" : "Reading the card",
      "Picking out a name, numbers and where they work",
      "Checking whether they're already in your people",
    ],
    reading,
  );

  const set = async (side: Side, blob: Blob) => {
    setError(null);
    try {
      const small = await shrink(blob);
      setImages((cur) => {
        if (cur[side]) URL.revokeObjectURL(cur[side]!.url);
        return { ...cur, [side]: { blob: small, url: URL.createObjectURL(small) } };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that image");
    }
    setCamera(null);
  };

  // Paste a screenshot or copied photo: fills the front, then the back.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!file || result) return;
      void set(images.front ? "back" : "front", file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  if (result) return <CardReview card={result.card} match={result.match} onRestart={() => setResult(null)} />;

  const slot = (side: Side) => {
    const img = images[side];
    if (camera === side) return <Webcam onShot={(b) => set(side, b)} onClose={() => setCamera(null)} />;
    return (
      <div className="grid gap-2">
        <p className="text-sm font-medium">{side === "front" ? "Front" : "Back (optional)"}</p>
        {img ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
            <img src={img.url} alt={`Card ${side}`} className="aspect-[16/10] w-full rounded-2xl bg-secondary object-contain" />
            <button
              type="button"
              aria-label={`Remove the ${side}`}
              onClick={() => setImages((cur) => ({ ...cur, [side]: undefined }))}
              className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-white/90 hover:bg-white"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) void set(side, f);
            }}
            className="grid aspect-[16/10] cursor-pointer place-content-center justify-items-center gap-2 rounded-2xl border-2 border-dashed border-border text-center text-sm text-muted-foreground hover:bg-muted"
          >
            <ImagePlus className="size-6" />
            Choose a photo, drop it, or paste it
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => e.target.files?.[0] && set(side, e.target.files[0])} />
          </label>
        )}
        {!img && (
          <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setCamera(side)}>
            <Camera />
            Use the camera
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 rounded-3xl bg-card p-6 md:grid-cols-2">
        {slot("front")}
        {slot("back")}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        size="lg"
        className="justify-self-start"
        disabled={!images.front || reading}
        onClick={() =>
          startRead(async () => {
            const fd = new FormData();
            for (const side of ["front", "back"] as const) if (images[side]) fd.append("image", images[side]!.blob, `${side}.jpg`);
            const res = await readCard(fd);
            if (res.error || !res.card) setError(res.error ?? "Couldn't read the card");
            else setResult({ card: res.card, match: res.match ?? null });
          })
        }
      >
        {reading ? "Reading the card…" : "Read card"}
      </Button>
      <WorkingSteps lines={steps} />
    </div>
  );
}

function CardReview({ card, match, onRestart }: { card: CardExtraction; match: { id: string; name: string } | null; onRestart: () => void }) {
  const [phones, setPhones] = useState(card.phones.filter((p) => p.label !== "fax").map((p, i) => ({ key: i, ...p })));
  const [emails, setEmails] = useState(card.emails.map((e, i) => ({ key: i, value: e })));
  const [merge, setMerge] = useState(!!match);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const a = card.address;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await saveCard(fd);
          if (res?.error) setError(res.error);
        });
      }}
      className="grid gap-6 rounded-3xl bg-card p-6"
    >
      {match && (
        <label className="flex items-start gap-3 rounded-2xl bg-butter px-4 py-3 text-sm">
          <input type="checkbox" name="mergeInto" value={match.id} checked={merge} onChange={(e) => setMerge(e.target.checked)} className="mt-0.5 size-4 accent-foreground" />
          <span>
            This looks like <span className="font-medium">{match.name}</span>, who you already have. Add these details to them instead of making someone new.
          </span>
        </label>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-[13px] text-muted-foreground">First name</span>
          <Input name="firstName" defaultValue={card.firstName} required maxLength={100} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[13px] text-muted-foreground">Last name</span>
          <Input name="lastName" defaultValue={card.lastName ?? ""} maxLength={100} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[13px] text-muted-foreground">Title</span>
          <Input name="jobTitle" defaultValue={card.jobTitle ?? ""} maxLength={200} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[13px] text-muted-foreground">Company</span>
          <Input name="company" defaultValue={card.company ?? ""} maxLength={200} />
        </label>
      </div>

      <div className="grid gap-2">
        <p className="text-[13px] text-muted-foreground">Phones</p>
        {phones.map((p) => (
          <div key={p.key} className="grid grid-cols-[120px_1fr_auto] gap-2">
            <select name="phoneLabel" defaultValue={p.label === "fax" ? "other" : p.label} aria-label="Phone label" className={selectClass}>
              {["mobile", "work", "home", "other"].map((l) => (
                <option key={l} value={l}>
                  {l[0]!.toUpperCase() + l.slice(1)}
                </option>
              ))}
            </select>
            <Input name="phone" defaultValue={p.value} aria-label="Phone" />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove phone" onClick={() => setPhones((all) => all.filter((x) => x.key !== p.key))}>
              <X />
            </Button>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setPhones((all) => [...all, { key: Date.now(), label: "mobile", value: "" }])}>
          <Plus />
          Phone
        </Button>
      </div>

      <div className="grid gap-2">
        <p className="text-[13px] text-muted-foreground">Emails</p>
        {emails.map((e) => (
          <div key={e.key} className="grid grid-cols-[1fr_auto] gap-2">
            <Input name="email" type="email" defaultValue={e.value} aria-label="Email" />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove email" onClick={() => setEmails((all) => all.filter((x) => x.key !== e.key))}>
              <X />
            </Button>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setEmails((all) => [...all, { key: Date.now(), value: "" }])}>
          <Plus />
          Email
        </Button>
      </div>

      {(card.websites.length > 0 || card.socials.length > 0) && (
        <div className="grid gap-2">
          <p className="text-[13px] text-muted-foreground">Web</p>
          {card.websites.map((w) => (
            <Input key={w} name="website" defaultValue={w} aria-label="Website" />
          ))}
          {card.socials.map((s) => (
            <label key={`${s.service}:${s.handle}`} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="social" value={`${s.service}:${s.handle}`} defaultChecked className="size-4 accent-foreground" />
              {s.service} @{s.handle}
            </label>
          ))}
        </div>
      )}

      <div className="grid gap-2">
        <p className="text-[13px] text-muted-foreground">Address</p>
        <Input name="street" defaultValue={[a?.street, a?.line2].filter(Boolean).join(", ")} placeholder="Street" aria-label="Street" />
        <div className="grid grid-cols-2 gap-2">
          <Input name="city" defaultValue={a?.city ?? ""} placeholder="City" aria-label="City" />
          <Input name="region" defaultValue={a?.region ?? ""} placeholder="Province or state" aria-label="Province or state" />
          <Input name="postalCode" defaultValue={a?.postalCode ?? ""} placeholder="Postal code" aria-label="Postal code" />
          <Input name="country" defaultValue={a?.country ?? ""} placeholder="Country" aria-label="Country" />
        </div>
      </div>

      {card.other && (
        <label className="grid gap-1.5">
          <span className="text-[13px] text-muted-foreground">Also on the card</span>
          <textarea name="other" rows={2} defaultValue={card.other} className={cn(textareaClass, "text-foreground")} />
        </label>
      )}
      <label className="grid gap-1.5">
        <span className="text-[13px] text-muted-foreground">Where did you meet?</span>
        <textarea name="howMet" rows={2} maxLength={2000} placeholder="At the Collision conference, booth by the coffee" className={cn(textareaClass, "text-foreground")} />
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? "Saving…" : merge && match ? `Add to ${match.name}` : "Save person"}
        </Button>
        <Button type="button" size="lg" variant="ghost" onClick={onRestart}>
          <RotateCcw />
          Scan another
        </Button>
      </div>
    </form>
  );
}
