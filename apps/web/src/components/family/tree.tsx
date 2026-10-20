"use client";

import type { HourglassLayout } from "@life-crm/core";
import { Crosshair, ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import type { RelativeRole } from "@/lib/data/family";
import { avatarSrc } from "@/lib/immich-urls";
import { cn } from "@/lib/utils";
import { AddRelativeForm } from "./add-relative";

export interface TreeCard {
  id: string;
  name: string;
  firstName: string;
  avatarRef: string | null;
  /** What they are to you: "Mother", "Second cousin". */
  term: string | null;
  years: string | null;
  isSelf: boolean;
  isDeceased: boolean;
  partners: { id: string; name: string }[];
  hasSoloChildren: boolean;
}

const SLOT = 184;
const CARD_W = 164;
const CARD_H = 112;
const ROW = 176;
const PAD = 32;

export function FamilyTree({
  layout,
  cards,
  focusId,
  people,
}: {
  layout: HourglassLayout;
  cards: Record<string, TreeCard>;
  focusId: string;
  people: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState<RelativeRole | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const focus = layout.nodes.find((n) => n.id === focusId);

  const left = (x: number) => PAD + x * SLOT - CARD_W / 2;
  const top = (gen: number) => PAD + (gen - layout.minGen) * ROW;
  const width = PAD * 2 + layout.width * SLOT;
  const height = PAD * 2 + (layout.maxGen - layout.minGen) * ROW + CARD_H;

  // Start with the focus person in view.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !focus) return;
    el.scrollLeft = left(focus.x) + CARD_W / 2 - el.clientWidth / 2;
    el.scrollTop = top(focus.gen) + CARD_H / 2 - el.clientHeight / 2;
    // Only when the focus changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  const close = useCallback(() => setAdding(null), []);
  const card = selected ? cards[selected] : null;

  return (
    <div className="relative">
      <div ref={scroller} className="h-[min(72vh,760px)] overflow-auto rounded-3xl bg-card">
        <div className="relative" style={{ width, height }}>
          <svg className="pointer-events-none absolute inset-0 text-border" width={width} height={height} aria-hidden>
            {layout.couples.map((c, i) => (
              <line
                key={`c${i}`}
                x1={left(c.x1) + CARD_W}
                x2={left(c.x2)}
                y1={top(c.gen) + CARD_H / 2}
                y2={top(c.gen) + CARD_H / 2}
                stroke="currentColor"
                strokeWidth={2}
              />
            ))}
            {layout.descents.map((d, i) => {
              const fromX = PAD + d.fromX * SLOT;
              const y0 = top(d.gen) + (d.fromCouple ? CARD_H / 2 : CARD_H);
              const mid = top(d.gen) + CARD_H + (ROW - CARD_H) / 2;
              const xs = d.childXs.map((x) => PAD + x * SLOT);
              const lo = Math.min(fromX, ...xs);
              const hi = Math.max(fromX, ...xs);
              const childTop = top(d.gen + 1);
              return (
                <path
                  key={`d${i}`}
                  d={[`M${fromX},${y0} V${mid}`, `M${lo},${mid} H${hi}`, ...xs.map((x) => `M${x},${mid} V${childTop}`)].join(" ")}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                />
              );
            })}
          </svg>

          {layout.nodes.map((n) => {
            const c = cards[n.id];
            if (!c) return null;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setSelected(n.id);
                  setAdding(null);
                }}
                aria-pressed={selected === n.id}
                style={{ left: left(n.x), top: top(n.gen), width: CARD_W, height: CARD_H }}
                className={cn(
                  "absolute grid content-center justify-items-center gap-1 rounded-2xl bg-background px-2 text-center ring-1 ring-border transition-shadow hover:ring-foreground/40",
                  n.id === focusId && "ring-2 ring-foreground",
                  selected === n.id && "ring-2 ring-coral",
                  c.isDeceased && "opacity-75",
                )}
              >
                <Avatar id={c.id} name={c.name} src={avatarSrc(c.avatarRef)} size={40} className={cn(c.isDeceased && "grayscale")} />
                <span className="w-full truncate text-sm font-medium">{c.isSelf ? "You" : c.name}</span>
                <span className="w-full truncate text-[11px] text-muted-foreground">
                  {[c.term && !c.isSelf ? c.term : null, c.years].filter(Boolean).join(" · ") || " "}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {card && (
        <aside className="absolute top-3 right-3 z-10 grid max-h-[calc(100%-1.5rem)] w-80 gap-4 overflow-y-auto rounded-3xl bg-card p-5 shadow-lg ring-1 ring-border">
          <div className="flex items-start gap-3">
            <Avatar id={card.id} name={card.name} src={avatarSrc(card.avatarRef)} size={48} />
            <div className="grid min-w-0 flex-1">
              <p className="truncate font-medium">{card.isSelf ? "You" : card.name}</p>
              <p className="truncate text-[13px] text-muted-foreground">{[card.isSelf ? null : card.term, card.years].filter(Boolean).join(" · ")}</p>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={() => setSelected(null)}>
              <X />
            </Button>
          </div>
          {adding ? (
            <AddRelativeForm
              anchor={{ id: card.id, firstName: card.firstName, isSelf: card.isSelf }}
              role={adding}
              people={people}
              anchorPartners={card.partners}
              hasSoloChildren={card.hasSoloChildren}
              onDone={close}
            />
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {card.id !== focusId && (
                  <Link href={`/family?focus=${card.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm hover:bg-muted">
                    <Crosshair className="size-3.5" />
                    Centre here
                  </Link>
                )}
                <Link href={`/people/${card.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm hover:bg-muted">
                  <ExternalLink className="size-3.5" />
                  Profile
                </Link>
              </div>
              <div className="grid gap-1.5">
                <p className="text-[13px] text-muted-foreground">Add {card.isSelf ? "your" : `${card.firstName}'s`}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(["parent", "partner", "sibling", "child"] as const).map((r) => (
                    <Button key={r} variant="outline" size="sm" onClick={() => setAdding(r)}>
                      {r === "child" ? "Child" : r[0]!.toUpperCase() + r.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>
      )}
    </div>
  );
}
