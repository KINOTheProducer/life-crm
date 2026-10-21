import { closenessTiers, contactShade, eraKindLabels, todayIn, yearTicks, type ClosenessTier } from "@life-crm/core";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { toneClass } from "@/components/circles/tones";
import { EraForm, EraList } from "@/components/timeline/eras";
import { PageHeader } from "@/components/page-header";
import { circleOptions } from "@/lib/data/circles";
import { lifeTimeline, listEras, type LifeRow } from "@/lib/data/life-timeline";
import { tenantQuery } from "@/lib/session";
import { cn } from "@/lib/utils";

const tierLabel: Record<ClosenessTier, string> = {
  inner: "Inner circle",
  close: "Close friends",
  friend: "Friends",
  acquaintance: "Acquaintances",
};
const tierTone: Record<ClosenessTier, string> = { inner: "bg-peach", close: "bg-sage", friend: "bg-lilac", acquaintance: "bg-sky" };

/** Band colours for your own eras, faint enough to sit behind the bars. */
const eraTone = { school: "bg-sky/35", home: "bg-sage/35", work: "bg-butter/45", other: "bg-lilac/35" } as const;

interface Group {
  key: string;
  label: string;
  tone: string;
  rows: LifeRow[];
}

export default async function LifeTimelinePage({ searchParams }: PageProps<"/people/timeline">) {
  const params = await searchParams;
  const by = params.by === "circle" ? "circle" : "closeness";
  const all = params.all === "1";
  const recent = params.range === "10";

  const data = await tenantQuery(async (tx, user) => {
    const currentYear = todayIn(user.timeZone).year;
    return {
      currentYear,
      timeline: await lifeTimeline(tx, user, currentYear),
      eras: await listEras(tx),
      circles: await circleOptions(tx),
    };
  });
  const { currentYear, eras, circles } = data;
  const since = recent ? currentYear - 9 : null;
  const rows = data.timeline.rows.filter((r) => (all || r.closeness !== "acquaintance" || r.isFamily) && (since == null || r.end >= since));

  const earliest = Math.min(...rows.map((r) => r.start), ...eras.map((e) => e.startYear), currentYear - 4);
  const min = since ?? earliest;
  const span = currentYear - min + 1;
  const left = (y: number) => ((Math.max(y, min) - min) / span) * 100;
  const width = (from: number, to: number) => ((to - Math.max(from, min) + 1) / span) * 100;
  const ticks = yearTicks(min, currentYear);
  const busiest = Math.max(1, ...rows.flatMap((r) => Object.values(r.contacts)));

  const groups: Group[] =
    by === "circle"
      ? [
          ...circles.map((c) => ({ key: c.id, label: c.name, tone: toneClass[c.tone], rows: rows.filter((r) => r.circleIds.includes(c.id)) })),
          { key: "none", label: "Not in a circle", tone: "bg-secondary", rows: rows.filter((r) => r.circleIds.length === 0) },
        ]
      : [
          { key: "family", label: "Family", tone: "bg-rose", rows: rows.filter((r) => r.isFamily) },
          ...closenessTiers.map((t) => ({ key: t, label: tierLabel[t], tone: tierTone[t], rows: rows.filter((r) => !r.isFamily && r.closeness === t) })),
        ];
  const shown = groups.filter((g) => g.rows.length > 0);

  const href = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    const next = { by: by === "circle" ? "circle" : null, all: all ? "1" : null, range: recent ? "10" : null, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) sp.set(k, v);
    return `/people/timeline${sp.size ? `?${sp}` : ""}`;
  };
  const chip = (active: boolean) => cn("rounded-full px-3.5 py-2 text-sm", active ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary");

  return (
    <>
      <Link href="/people" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        People
      </Link>
      <PageHeader
        title="Over the years."
        aside={rows.length ? `${rows.length} ${rows.length === 1 ? "person" : "people"} since ${min}.` : "Who came into your life, and when."}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={href({ by: null })} className={chip(by === "closeness")}>
          By closeness
        </Link>
        <Link href={href({ by: "circle" })} className={chip(by === "circle")}>
          By circle
        </Link>
        <span className="mx-2 h-5 w-px bg-border" />
        <Link href={href({ range: null })} className={chip(!recent)}>
          All time
        </Link>
        <Link href={href({ range: "10" })} className={chip(recent)}>
          Last 10 years
        </Link>
        <span className="mx-2 h-5 w-px bg-border" />
        <Link href={href({ all: all ? null : "1" })} className={chip(all)}>
          Include acquaintances
        </Link>
      </div>

      <div className="grid gap-8 xl:grid-cols-[1fr_300px]">
        <section className="overflow-x-auto rounded-3xl bg-card p-6">
          {rows.length === 0 ? (
            <div className="grid gap-2 py-6">
              <p className="type-display text-3xl">No one to show yet.</p>
              <p className="text-muted-foreground">Add when you met people on their page (under Details), and log catch-ups.</p>
            </div>
          ) : (
            <div className="relative min-w-[720px]">
              {/* Your eras, behind everything. */}
              <div className="pointer-events-none absolute inset-y-0 right-0 left-[180px]">
                {eras.map((e) => (
                  <div
                    key={e.id}
                    className={cn("absolute inset-y-0 rounded-lg", eraTone[e.kind])}
                    style={{ left: `${left(e.startYear)}%`, width: `${width(e.startYear, e.endYear ?? currentYear)}%` }}
                  >
                    <span className="absolute top-1 left-1.5 truncate text-[11px] text-foreground/60" style={{ maxWidth: "calc(100% - 0.75rem)" }}>
                      {e.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="relative grid grid-cols-[180px_1fr] pt-6">
                <div />
                <div className="relative mb-2 h-5 border-b border-border">
                  {ticks.map((t) => (
                    <span key={t} className="absolute -translate-x-1/2 font-mono text-[11px] text-muted-foreground" style={{ left: `${left(t) + 50 / span}%` }}>
                      {t}
                    </span>
                  ))}
                </div>

                {shown.map((g) => (
                  <GroupRows key={g.key} group={g} left={left} width={width} min={min} currentYear={currentYear} busiest={busiest} span={span} />
                ))}
              </div>
            </div>
          )}
          <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-6 rounded-full bg-gradient-to-r from-transparent to-coral" />
              Darker means more catch-ups that year
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded-l-full border-l-2 border-dashed border-foreground/40 bg-secondary" />
              Start is a guess
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-foreground" />
              Life event
            </span>
          </p>
        </section>

        <aside className="grid content-start gap-4 rounded-3xl bg-card p-6">
          <div className="grid gap-1">
            <h2 className="type-display text-2xl">Your eras</h2>
            <p className="text-sm text-muted-foreground">Schools, cities, jobs. They show behind the bars, so you can see who arrived when.</p>
          </div>
          <EraList eras={eras.map((e) => ({ id: e.id, label: e.label, kind: eraKindLabels[e.kind], years: `${e.startYear}–${e.endYear ?? "now"}` }))} />
          <EraForm currentYear={currentYear} />
        </aside>
      </div>
    </>
  );
}

function GroupRows({
  group,
  left,
  width,
  min,
  currentYear,
  busiest,
  span,
}: {
  group: Group;
  left: (y: number) => number;
  width: (from: number, to: number) => number;
  min: number;
  currentYear: number;
  busiest: number;
  span: number;
}) {
  return (
    <>
      <p className="col-span-2 mt-3 mb-1 flex items-center gap-2 text-[13px] text-muted-foreground">
        <span className={cn("size-2.5 rounded-full ring-1 ring-foreground/15", group.tone)} />
        {group.label} · {group.rows.length}
      </p>
      {group.rows.map((r) => {
        const years: number[] = [];
        for (let y = Math.max(r.start, min); y <= r.end; y++) years.push(y);
        const ending = r.ended === "died" ? `, died ${r.end}` : r.ended === "lost_touch" ? `, lost touch ${r.end}` : "";
        return (
          <div key={`${group.key}-${r.id}`} className="contents">
            <Link href={`/people/${r.id}`} className="truncate py-1 pr-3 text-sm hover:underline">
              {r.name}
            </Link>
            <div className="relative h-7">
              <Link
                href={`/people/${r.id}`}
                title={`${r.name}: since ${r.startGuessed ? "about " : ""}${r.start}${ending}`}
                className={cn(
                  "absolute top-1 flex h-5 overflow-hidden rounded-full transition-opacity hover:opacity-80",
                  group.tone,
                  r.startGuessed && r.start >= min && "rounded-l-none border-l-2 border-dashed border-foreground/40",
                  r.ended && "rounded-r-sm",
                )}
                style={{ left: `${left(r.start)}%`, width: `${width(r.start, r.end)}%` }}
              >
                {years.map((y) => (
                  <span key={y} className="h-full flex-1 bg-coral" style={{ opacity: contactShade(r.contacts[y] ?? 0, busiest) * 0.85 }} />
                ))}
              </Link>
              {r.events
                .filter((e) => e.year >= min && e.year <= currentYear)
                .map((e, i) => (
                  <span
                    key={i}
                    title={`${e.label}, ${e.year}`}
                    className="absolute top-2.5 size-2 -translate-x-1/2 rounded-full bg-foreground ring-2 ring-card"
                    style={{ left: `${left(e.year) + 50 / span}%` }}
                  />
                ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
