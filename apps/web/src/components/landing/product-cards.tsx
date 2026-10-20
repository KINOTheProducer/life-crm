import { cn } from "@/lib/utils";

/** Small, static pieces of the real UI used as illustrations on the landing page. */

export function BirthdayCard({ className }: { className?: string }) {
  return (
    <div className={cn("w-72 rounded-3xl bg-white p-4 text-foreground shadow-[0_30px_60px_-24px_rgb(0_0_0/0.5)]", className)}>
      <p className="font-mono text-[11px] text-muted-foreground uppercase">Saturday, Oct 24</p>
      <div className="mt-2.5 flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-peach text-sm font-medium">SC</span>
        <div>
          <p className="type-display text-[1.6rem]">Sarah turns 32</p>
          <p className="text-[13px] text-muted-foreground">She mentioned wanting a Chemex</p>
        </div>
      </div>
    </div>
  );
}

const bars = [10, 22, 14, 30, 18, 26, 8, 20, 32, 16, 24, 10, 28, 14, 20, 9, 25, 15, 30, 12, 22, 8, 18, 26, 12];

export function VoiceNoteCard({ className }: { className?: string }) {
  return (
    <div className={cn("w-72 rounded-3xl bg-white p-4 text-foreground shadow-[0_30px_60px_-24px_rgb(0_0_0/0.5)]", className)}>
      <p className="font-mono text-[11px] text-muted-foreground uppercase">Voice note · 0:42</p>
      <div aria-hidden className="my-2.5 flex h-8 items-center gap-[3px]">
        {bars.map((h, i) => (
          <span key={i} className="w-[3px] rounded-full bg-coral" style={{ height: h }} />
        ))}
      </div>
      <p className="text-[13px]">&ldquo;Daniel&apos;s a chef, his birthday is March 3rd…&rdquo;</p>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-full bg-peach px-2.5 py-1">New: Daniel</span>
        <span className="rounded-full bg-butter px-2.5 py-1">Birthday Mar 3</span>
        <span className="rounded-full bg-sage px-2.5 py-1">Chef</span>
      </div>
    </div>
  );
}

export function DriftingCard({ className }: { className?: string }) {
  const people = [
    ["MO", "Mike Okafor", "48 days", "bg-sage"],
    ["JR", "Jess Ross", "47 days", "bg-lilac"],
    ["TW", "Tom Wright", "3 months", "bg-sky"],
  ] as const;
  return (
    <div className={cn("w-72 rounded-3xl bg-white p-4 text-foreground shadow-[0_30px_60px_-24px_rgb(0_0_0/0.5)]", className)}>
      <p className="text-[13px] text-muted-foreground">Time to catch up</p>
      <ul className="mt-1 divide-y divide-border">
        {people.map(([i, name, ago, tone]) => (
          <li key={name} className="flex items-center gap-3 py-2">
            <span className={cn("grid size-8 place-items-center rounded-full text-xs font-medium", tone)}>{i}</span>
            <span className="flex-1 text-sm font-medium">{name}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{ago}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReviewCard({ className }: { className?: string }) {
  const rows = [
    ["Birthday", "March 3", true],
    ["Job", "Chef at Pai", true],
    ["Partner", "Sarah Chen", true],
    ["Allergy", "Shellfish", false],
  ] as const;
  return (
    <div className={cn("w-72 rounded-3xl bg-white p-4 text-foreground ring-1 ring-border", className)}>
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-full bg-peach text-xs font-medium">D</span>
        <span className="font-medium">Daniel</span>
        <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[11px]">New person</span>
      </div>
      <ul className="mt-2 divide-y divide-border text-[13px]">
        {rows.map(([label, value, on]) => (
          <li key={label} className={cn("flex items-center gap-2.5 py-2", !on && "opacity-45")}>
            <span className={cn("grid size-4 place-items-center rounded-[5px] border text-[10px] leading-none", on ? "border-foreground bg-foreground text-white" : "border-input")}>
              {on ? "✓" : ""}
            </span>
            <span className="text-muted-foreground">{label}</span>
            <span className="ml-auto">{value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
