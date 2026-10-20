import { anniversaryName, milestoneLabels, todayIn, type PartnerPromptSection } from "@life-crm/core";
import { and, eq, isNull, schema } from "@life-crm/db";
import { ArrowLeft, Heart, Star } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import {
  DateNightForm,
  EndPartnershipForm,
  FactList,
  LoveLanguages,
  MakePartnerForm,
  MilestoneForm,
  PartnershipDetailsForm,
  PromptsForm,
  RemoveMilestoneButton,
} from "@/components/partner/partner-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fullName } from "@/lib/data/contacts";
import { formatPartialDate, parseIsoDate, toIsoDate } from "@/lib/data/dates";
import { getPartnerProfile, userPrefs } from "@/lib/data/partners";
import { tenantQuery } from "@/lib/session";

const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const shortDate = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function fmtIso(iso: string) {
  const d = parseIsoDate(iso);
  return shortDate.format(new Date(Date.UTC(d.year, d.month - 1, d.day)));
}

const promptSections: { key: PartnerPromptSection; title: string; description: string }[] = [
  { key: "love", title: "How they like to be loved", description: "The things that are easy to forget in the moment." },
  { key: "favourites", title: "Favourites", description: "For gifts, takeout and Friday nights." },
  { key: "sizes", title: "Sizes", description: "So you never have to ask." },
];

export default async function PartnerPage({ params }: PageProps<"/people/[id]/partner">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const data = await tenantQuery(async (tx, user) => {
    const [contact] = await tx
      .select()
      .from(schema.contacts)
      .where(and(eq(schema.contacts.id, id), isNull(schema.contacts.deletedAt)));
    if (!contact) return null;
    return {
      contact,
      prefs: await userPrefs(tx, user.id),
      profile: await getPartnerProfile(tx, id, user.timeZone),
      today: toIsoDate(todayIn(user.timeZone)),
    };
  });
  if (!data) notFound();
  const { contact, prefs, profile, today } = data;
  const name = fullName(contact);
  const polyamorous = prefs.relationshipStyle === "polyamorous";

  const back = (
    <Link href={`/people/${id}`} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-3.5" />
      {name}
    </Link>
  );

  if (!profile) {
    return (
      <>
        {back}
        <header className="grid gap-2 pb-8">
          <h1 className="type-display text-[3.25rem] leading-[1.02]">
            {contact.firstName} <em className="text-muted-foreground">and you.</em>
          </h1>
          <p className="max-w-xl text-[15px] text-muted-foreground">
            Make {contact.firstName} your partner to track anniversaries, date nights, love languages, sizes and gift ideas in one place.
          </p>
        </header>
        <Card className="max-w-2xl">
          <CardContent>
            <MakePartnerForm contactId={id} polyamorous={polyamorous} />
          </CardContent>
        </Card>
      </>
    );
  }

  const { partnership, milestones, dates, facts, together, nextAnniversary, dateNight } = profile;
  const past = partnership.status === "past";
  const byCategory = (c: string) => facts.filter((f) => f.category === c);
  const answers = (c: string) => Object.fromEntries(byCategory(c).map((f) => [f.label, f.value]));

  const year = today.slice(0, 4);
  const thisYear = dates.filter((d) => d.occurredOn.startsWith(year));
  const spent = thisYear.reduce((n, d) => n + (d.costCents ?? 0), 0);
  const rated = dates.filter((d) => d.rating);
  const avgRating = rated.length ? rated.reduce((n, d) => n + d.rating!, 0) / rated.length : null;

  const stats = [
    together && { label: past ? "Were together" : "Together", value: together },
    !past &&
      nextAnniversary && {
        label: `Next ${anniversaryName(nextAnniversary.milestone)}`,
        value: nextAnniversary.daysAway === 0 ? "Today" : `${nextAnniversary.daysAway} days`,
        hint: nextAnniversary.turning ? `${nextAnniversary.turning} years` : undefined,
        accent: nextAnniversary.daysAway <= 21,
      },
    !past && {
      label: "Last date",
      value: dates[0] ? (dateNight.daysSince === 0 ? "Today" : `${dateNight.daysSince} days ago`) : "None logged",
      accent: dateNight.due,
    },
  ].filter(Boolean) as { label: string; value: string; hint?: string; accent?: boolean }[];

  return (
    <>
      {back}
      <header className="flex flex-wrap items-end justify-between gap-6 pb-8">
        <div className="flex items-end gap-5">
          <Avatar id={contact.id} name={name} size={104} className="text-[2.5rem]" />
          <div className="grid gap-2">
            <h1 className="type-display text-[3.25rem] leading-[1.02]">
              {contact.firstName} <em className="text-muted-foreground">and you.</em>
            </h1>
            <p className="flex flex-wrap items-center gap-2 text-[15px] text-muted-foreground">
              <Badge variant="accent">
                <Heart className="fill-current" />
                {partnership.label}
              </Badge>
              {partnership.isNesting && <Badge variant="outline">Nesting</Badge>}
              {past && partnership.endedOn && <span>Ended {fmtIso(partnership.endedOn)}</span>}
            </p>
          </div>
        </div>
      </header>

      {past && (
        <Card className="mb-6 max-w-2xl">
          <CardHeader>
            <CardTitle>Back together?</CardTitle>
            <CardDescription>Everything below is still here. Anniversaries you add from now on get reminders again.</CardDescription>
          </CardHeader>
          <CardContent>
            <MakePartnerForm contactId={id} polyamorous={polyamorous} />
          </CardContent>
        </Card>
      )}

      {stats.length > 0 && (
        <div className="mb-6 grid gap-3.5 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className={s.accent ? "rounded-3xl bg-coral p-6 text-white" : "rounded-3xl bg-card p-6"}>
              <p className={s.accent ? "text-sm text-white/85" : "text-sm text-muted-foreground"}>{s.label}</p>
              <p className="type-display mt-1 text-[2rem] leading-tight">{s.value}</p>
              {s.hint && <p className={s.accent ? "text-sm text-white/85" : "text-sm text-muted-foreground"}>{s.hint}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Your story</CardTitle>
              <CardDescription>Milestones, and which ones get a yearly reminder.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {milestones.length === 0 ? (
                <p className="text-sm text-muted-foreground">Start with when you got together.</p>
              ) : (
                <ol className="relative grid gap-4 border-l border-border pl-5">
                  {milestones.map((m) => (
                    <li key={m.id} className="group relative flex items-start justify-between gap-3">
                      <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-coral" />
                      <span className="grid">
                        <span className="font-medium">{m.kind === "custom" && m.label ? m.label : milestoneLabels[m.kind]}</span>
                        <span className="text-[13px] text-muted-foreground">
                          {formatPartialDate(m.date)}
                          {m.anniversary && " · yearly reminder"}
                        </span>
                      </span>
                      <RemoveMilestoneButton contactId={id} milestoneId={m.id} />
                    </li>
                  ))}
                </ol>
              )}
              <MilestoneForm contactId={id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Date nights</CardTitle>
              <CardDescription>
                {thisYear.length} this year
                {spent > 0 && ` · ${cad.format(spent / 100)} spent`}
                {avgRating != null && ` · ${avgRating.toFixed(1)} average`}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <DateNightForm contactId={id} today={today} />
              {dates.length > 0 && (
                <ul className="divide-y divide-border border-t border-border">
                  {dates.map((d) => (
                    <li key={d.id} className="grid gap-0.5 py-3 text-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-medium">{d.place ?? "Date night"}</span>
                        <span className="type-meta shrink-0 text-muted-foreground">{fmtIso(d.occurredOn)}</span>
                      </div>
                      {d.notes && <p className="text-muted-foreground">{d.notes}</p>}
                      {(d.rating || d.costCents != null) && (
                        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                          {d.rating && (
                            <span className="flex" aria-label={`${d.rating} of 5`}>
                              {Array.from({ length: d.rating }, (_, i) => (
                                <Star key={i} className="size-3 fill-coral text-coral" />
                              ))}
                            </span>
                          )}
                          {d.costCents != null && cad.format(d.costCents / 100)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Love languages</CardTitle>
              <CardDescription>Most important first.</CardDescription>
            </CardHeader>
            <CardContent>
              <LoveLanguages contactId={id} ranked={partnership.loveLanguages} />
            </CardContent>
          </Card>

          {promptSections.map((s) => (
            <Card key={s.key}>
              <CardHeader>
                <CardTitle>{s.title}</CardTitle>
                <CardDescription>{s.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <PromptsForm contactId={id} section={s.key} answers={answers(s.key)} />
              </CardContent>
            </Card>
          ))}
        </div>

        <aside className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Ask them about</CardTitle>
            </CardHeader>
            <CardContent>
              <FactList
                contactId={id}
                category="follow_up"
                items={byCategory("follow_up")}
                placeholder="Their review on Thursday"
                empty="Things they mentioned that deserve a follow-up."
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Gift ideas</CardTitle>
            </CardHeader>
            <CardContent>
              <FactList
                contactId={id}
                category="wishlist"
                items={byCategory("wishlist")}
                placeholder="That ceramic mug from the market"
                empty="Anything they mention wanting. Voice notes add here too."
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Relationship</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              <PartnershipDetailsForm
                contactId={id}
                label={partnership.label}
                isNesting={partnership.isNesting}
                dateCadenceDays={partnership.dateCadenceDays}
                agreements={partnership.agreements}
                polyamorous={polyamorous}
              />
              {!past && (
                <div className="border-t border-border pt-4">
                  <EndPartnershipForm contactId={id} firstName={contact.firstName} today={today} />
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
