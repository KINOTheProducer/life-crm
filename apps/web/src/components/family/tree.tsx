"use client";

import type { HourglassLayout } from "@life-crm/core";
import { Crosshair, ExternalLink, Pencil, ScanFace, Search, Users, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { removeFriend, type AddRole } from "@/app/(app)/family/actions";
import { Avatar } from "@/components/avatar";
import { FacePicker } from "@/components/faces/faces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { avatarSrc } from "@/lib/immich-urls";
import { cn } from "@/lib/utils";
import { AddRelativeForm } from "./add-relative";
import { EditPersonForm, type EditablePerson } from "./edit-person";

export interface TreeCard extends EditablePerson {
  name: string;
  avatarRef: string | null;
  /** What they are to you: "Mother", "Second cousin", "Sam's friend", "Close friend". */
  term: string | null;
  years: string | null;
  isDeceased: boolean;
  partners: { id: string; name: string }[];
  hasSoloChildren: boolean;
  /** People they're linked to as a friend. */
  friendLinks: { id: string; firstName: string }[];
  friendCount: number;
}

type PanelMode = { kind: "view" } | { kind: "add"; role: AddRole } | { kind: "edit" } | { kind: "faces" };

/** Friends of the person in focus, beside the tree. */
function FriendLane({
  groups,
  cards,
  focus,
  selected,
  onSelect,
}: {
  groups: { label: string; ids: string[] }[];
  cards: Record<string, TreeCard>;
  focus: TreeCard | undefined;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const total = groups.reduce((n, g) => n + g.ids.length, 0);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return groups.map((g) => ({ ...g, ids: q ? g.ids.filter((id) => cards[id]?.name.toLowerCase().includes(q)) : g.ids })).filter((g) => g.ids.length);
  }, [groups, cards, filter]);
  const whose = !focus || focus.isSelf ? "Your" : `${focus.firstName}'s`;

  return (
    <section className="grid gap-4 rounded-3xl bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-medium">
          <Users className="size-4 text-muted-foreground" />
          {whose} friends
          <span className="text-sm font-normal text-muted-foreground">{total || ""}</span>
        </h2>
        {total > 12 && (
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a friend" aria-label="Find a friend" className="pl-10" />
          </div>
        )}
      </div>
      {total === 0 && (
        <p className="text-sm text-muted-foreground">
          No friends here yet. Click {!focus || focus.isSelf ? "yourself" : focus.firstName} in the tree and pick Friend.
        </p>
      )}
      {shown.map((g) => (
        <div key={g.label} className="grid gap-2">
          {groups.length > 1 && <p className="text-[13px] text-muted-foreground">{g.label}</p>}
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
            {g.ids.map((id) => {
              const c = cards[id];
              if (!c) return null;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onSelect(id)}
                    aria-pressed={selected === id}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-2xl bg-background p-2 text-left ring-1 ring-border hover:ring-foreground/40",
                      selected === id && "ring-2 ring-coral",
                      c.isDeceased && "opacity-75",
                    )}
                  >
                    <Avatar id={c.id} name={c.name} src={avatarSrc(c.avatarRef)} size={32} className={cn(c.isDeceased && "grayscale")} />
                    <span className="grid min-w-0">
                      <span className="truncate text-sm font-medium">{c.name}</span>
                      {c.friendCount > 0 && <span className="truncate text-[11px] text-muted-foreground">{c.friendCount} {c.friendCount === 1 ? "friend" : "friends"}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
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
  lane,
  immich,
}: {
  layout: HourglassLayout;
  cards: Record<string, TreeCard>;
  focusId: string;
  people: { id: string; name: string }[];
  lane: { label: string; ids: string[] }[];
  immich: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<PanelMode>({ kind: "view" });
  const [unlinking, startUnlink] = useTransition();
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

  const close = useCallback(() => setMode({ kind: "view" }), []);
  const select = (id: string) => {
    setSelected(id);
    setMode({ kind: "view" });
  };
  const card = selected ? cards[selected] : null;

  return (
    <div className="grid gap-6">
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
            {layout.siblingBars.map((b, i) => {
              const y = top(b.gen) - 16;
              const xs = b.xs.map((x) => PAD + x * SLOT);
              return (
                <path
                  key={`s${i}`}
                  d={[`M${xs[0]},${y} H${xs[xs.length - 1]}`, ...xs.map((x) => `M${x},${y} V${top(b.gen)}`)].join(" ")}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                />
              );
            })}
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
                onClick={() => select(n.id)}
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
                {c.friendCount > 0 && n.id !== focusId && (
                  <span className="absolute top-1.5 right-2 flex items-center gap-0.5 text-[11px] text-muted-foreground" title={`${c.friendCount} ${c.friendCount === 1 ? "friend" : "friends"}`}>
                    <Users className="size-3" />
                    {c.friendCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <FriendLane groups={lane} cards={cards} focus={cards[focusId]} selected={selected} onSelect={select} />

      {card && (
        <aside
          className={cn(
            "fixed inset-x-3 bottom-3 z-50 grid max-h-[75vh] gap-4 overflow-y-auto rounded-3xl bg-card p-5 shadow-lg ring-1 ring-border sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-h-[calc(100vh-2rem)]",
            mode.kind === "faces" ? "sm:w-[26rem]" : "sm:w-80",
          )}
        >
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
          {mode.kind === "add" ? (
            <AddRelativeForm
              key={mode.role}
              anchor={{ id: card.id, firstName: card.firstName, isSelf: card.isSelf }}
              role={mode.role}
              people={people}
              anchorPartners={card.partners}
              hasSoloChildren={card.hasSoloChildren}
              onDone={close}
            />
          ) : mode.kind === "edit" ? (
            <EditPersonForm person={card} onDone={close} />
          ) : mode.kind === "faces" ? (
            <FacePicker contactId={card.id} firstName={card.firstName} multiple onDone={close} />
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
                <button type="button" onClick={() => setMode({ kind: "edit" })} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm hover:bg-muted">
                  <Pencil className="size-3.5" />
                  Edit
                </button>
                {immich && (
                  <button type="button" onClick={() => setMode({ kind: "faces" })} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm hover:bg-muted">
                    <ScanFace className="size-3.5" />
                    {card.avatarRef ? "Faces" : "Link face"}
                  </button>
                )}
              </div>
              <div className="grid gap-1.5">
                <p className="text-[13px] text-muted-foreground">Add {card.isSelf ? "your" : `${card.firstName}'s`}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(["parent", "partner", "sibling", "child", "friend"] as const).map((r) => (
                    <Button key={r} variant="outline" size="sm" onClick={() => setMode({ kind: "add", role: r })} className={cn(r === "friend" && "col-span-2")}>
                      {r[0]!.toUpperCase() + r.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
              {card.friendLinks.length > 0 && (
                <ul className="grid gap-1 border-t border-border pt-3 text-sm">
                  {card.friendLinks.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-muted-foreground">Friend of {f.firstName}</span>
                      <button
                        type="button"
                        disabled={unlinking}
                        onClick={() => startUnlink(() => removeFriend(card.id, f.id))}
                        className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        Remove link
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </aside>
      )}
    </div>
  );
}
