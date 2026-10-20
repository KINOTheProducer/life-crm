import { factCategoryLabels, todayIn, upcoming } from "@life-crm/core";
import { ArrowLeft, FileUp, Heart, Mail, MessageCircle, Mic, Phone, StickyNote } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { BirthdayField } from "@/components/profile/birthday-field";
import { Composer } from "@/components/profile/composer";
import { FactsPanel } from "@/components/profile/facts-panel";
import { CustomReminderList } from "@/components/reminders/custom-reminder-list";
import { ReminderForm } from "@/components/reminders/reminder-form";
import { Timeline } from "@/components/profile/timeline";
import { MemoryCard } from "@/components/memories/memory-card";
import { FacesCard, PersonPhotosPanel } from "@/components/faces/faces";
import { FamilyCard } from "@/components/family/family-card";
import { TrashPersonButton } from "@/components/people/trash-actions";
import { ContactCard } from "@/components/profile/contact-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPartialDate, toIsoDate } from "@/lib/data/dates";
import { getProfile, parseKinds } from "@/lib/data/profile";
import { contactInfoFor } from "@/lib/data/contact-info";
import { facesFor } from "@/lib/data/faces";
import { ensureSelf, loadFamily, relationsOf } from "@/lib/data/family";
import { listMemories } from "@/lib/data/memories";
import { immichConnection } from "@/lib/immich";
import { avatarSrc } from "@/lib/immich-urls";
import { listCustomReminders } from "@/lib/data/reminders";
import { tenantQuery } from "@/lib/session";


const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function daysSince(date: Date) {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function lastTalked(date: Date | null) {
  if (!date) return "No catch-ups logged yet";
  const days = daysSince(date);
  if (days <= 0) return "Caught up today";
  if (days === 1) return "Caught up yesterday";
  return `Last caught up ${days} days ago`;
}

export default async function PersonPage({ params, searchParams }: PageProps<"/people/[id]">) {
  const { id } = await params;
  const { kind, before } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const kinds = parseKinds(kind);
  const cursor = typeof before === "string" && /^[0-9a-f-]{36}$/.test(before) ? before : undefined;

  const result = await tenantQuery(async (tx, user) => ({
    profile: await getProfile(tx, id, { kinds, before: cursor }),
    reminders: await listCustomReminders(tx, user.id, id),
    memories: await listMemories(tx, { contactId: id, limit: 3 }),
    faces: (await facesFor(tx, [id])).get(id) ?? [],
    info: await contactInfoFor(tx, id),
    immich: Boolean(await immichConnection(tx, user.id)),
    family: relationsOf(await loadFamily(tx, await ensureSelf(tx, user)), id),
    timeZone: user.timeZone,
  }));
  if (!result.profile) notFound();
  const { profile, timeZone } = result;
  const { contact, partnership } = profile;
  const isPartner = partnership?.status === "current";

  const today = todayIn(timeZone);
  const phone = result.info.methods.find((m) => m.kind === "phone" && m.isPrimary);
  const email = result.info.methods.find((m) => m.kind === "email" && m.isPrimary);
  const nextBirthday = profile.birthday ? upcoming(profile.birthday, today) : null;
  const overdue =
    !contact.isDeceased &&
    contact.keepInTouchDays != null &&
    (contact.lastInteractionAt ? daysSince(contact.lastInteractionAt) : Infinity) > contact.keepInTouchDays;

  const tierName = { inner: "Inner circle", close: "Close friend", friend: "Friend", acquaintance: "Acquaintance" }[contact.closeness];
  const summary = [
    isPartner ? null : (contact.relationship ?? (result.family.toYou && result.family.toYou !== "you" ? capitalize(result.family.toYou) : tierName)),
    !contact.isDeceased &&
      nextBirthday &&
      (nextBirthday.daysAway === 0
        ? "birthday today"
        : nextBirthday.daysAway <= 14
          ? `birthday in ${nextBirthday.daysAway} days${nextBirthday.turning ? `, turning ${nextBirthday.turning}` : ""}`
          : null),
    contact.isDeceased ? `passed away${contact.deathYear ? ` in ${contact.deathYear}` : ""}` : lastTalked(contact.lastInteractionAt).toLowerCase(),
  ].filter(Boolean);

  return (
    <>
      <Link href="/people" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        People
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-6 pb-8">
        <div className="flex items-end gap-5">
          <Avatar id={contact.id} name={profile.name} src={avatarSrc(contact.avatarRef)} size={104} className="text-[2.5rem]" />
          <div className="grid gap-2">
            <h1 className="type-display text-[3.25rem] leading-[1.02]">
              {profile.name}
              {contact.nickname && <em className="text-muted-foreground"> “{contact.nickname}”</em>}
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-muted-foreground">
              {isPartner && (
                <Badge variant="accent">
                  <Heart className="fill-current" />
                  {partnership.label}
                </Badge>
              )}
              {summary.map((s, i) => (
                <span key={i}>
                  {i > 0 && <span className="mr-2">·</span>}
                  {s}
                </span>
              ))}
              {contact.pronouns && <Badge variant="outline">{contact.pronouns}</Badge>}
              {overdue && <Badge variant="accent">Due for a catch-up</Badge>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {phone?.href && (
            <a href={phone.href} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label={`Call ${contact.firstName}`} title={`Call ${phone.display}`}>
              <Phone />
            </a>
          )}
          {phone && (
            <a href={`sms:${phone.value}`} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label={`Text ${contact.firstName}`} title={`Text ${phone.display}`}>
              <MessageCircle />
            </a>
          )}
          {email?.href && (
            <a href={email.href} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label={`Email ${contact.firstName}`} title={email.display}>
              <Mail />
            </a>
          )}
          {isPartner && (
            <Link href={`/people/${contact.id}/partner`} className={buttonVariants({ variant: "outline" })}>
              <Heart />
              Partner profile
            </Link>
          )}
          <Link href={`/people/${contact.id}/import`} className={buttonVariants({ variant: "ghost" })}>
            <FileUp />
            Import
          </Link>
          {/* Plain anchors: these open the composer through hashchange, which next/link doesn't fire. */}
          <a href="#note" className={buttonVariants({ variant: "outline" })}>
            <StickyNote />
            Add note
          </a>
          <a href="#catch-up" className={buttonVariants({ variant: "outline" })}>
            Log catch-up
          </a>
          <Link href={`/capture/new?contact=${contact.id}`} className={buttonVariants()}>
            <Mic />
            Voice note
          </Link>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="grid content-start gap-8">
          <Composer contactId={contact.id} firstName={contact.firstName} today={toIsoDate(today)} />
          {result.faces.length > 0 && result.immich && <PersonPhotosPanel contactId={contact.id} firstName={contact.firstName} />}
          <Timeline
            contactId={contact.id}
            entries={profile.timeline.entries}
            hasMore={profile.timeline.hasMore}
            activeKinds={kinds}
            names={profile.names}
            timeZone={timeZone}
          />
        </div>

        <aside className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent>
              <ContactCard contactId={contact.id} info={result.info} company={contact.company} jobTitle={contact.jobTitle} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <BirthdayField contactId={contact.id} birthday={profile.birthday}>
                {profile.birthday && nextBirthday ? (
                  <p>
                    {formatPartialDate(profile.birthday)}
                    <span className="text-muted-foreground">
                      {" · "}
                      {nextBirthday.daysAway === 0 ? "today" : `in ${nextBirthday.daysAway} days`}
                      {nextBirthday.turning != null && `, turning ${nextBirthday.turning}`}
                    </span>
                  </p>
                ) : (
                  <p className="text-muted-foreground">Unknown</p>
                )}
              </BirthdayField>
              {contact.howMet && (
                <div className="grid gap-1">
                  <p className="text-[13px] text-muted-foreground">How you met</p>
                  <p>{contact.howMet}</p>
                </div>
              )}
              {contact.relationship && (
                <div className="grid gap-1">
                  <p className="text-[13px] text-muted-foreground">To you</p>
                  <p>{contact.relationship}</p>
                </div>
              )}
              {!isPartner && (
                <Link href={`/people/${contact.id}/partner`} className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  {partnership ? "Past partner" : "Mark as partner"}
                </Link>
              )}
              {contact.keepInTouchDays && (
                <div className="grid gap-1">
                  <p className="text-[13px] text-muted-foreground">Keep in touch</p>
                  <p>Every {contact.keepInTouchDays} days</p>
                </div>
              )}
              {!contact.isSelf && <TrashPersonButton contactId={contact.id} firstName={contact.firstName} />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Family</CardTitle>
            </CardHeader>
            <CardContent>
              <FamilyCard
                contactId={contact.id}
                firstName={contact.firstName}
                relations={result.family.relations}
                isSelf={contact.isSelf}
                isDeceased={contact.isDeceased}
                deathYear={contact.deathYear}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Reminders</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <CustomReminderList items={result.reminders} />
              <ReminderForm today={toIsoDate(today)} contactId={contact.id} placeholder={`Ask ${contact.firstName} about…`} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Memories</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {result.memories.length === 0 && <p className="text-sm text-muted-foreground">Trips, birthdays, nights out with {contact.firstName}.</p>}
              {result.memories.map((m) => (
                <MemoryCard key={m.id} memory={m} compact />
              ))}
              <div className="flex gap-4 text-sm">
                <Link href={`/memories/new?person=${contact.id}`} className="font-medium underline-offset-4 hover:underline">
                  Add a memory
                </Link>
                {result.memories.length > 0 && (
                  <Link href={`/memories?person=${contact.id}`} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                    See all
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
          {result.immich && (
            <Card>
              <CardHeader>
                <CardTitle>In Immich</CardTitle>
              </CardHeader>
              <CardContent>
                <FacesCard contactId={contact.id} firstName={contact.firstName} faces={result.faces} avatarRef={contact.avatarRef} />
              </CardContent>
            </Card>
          )}
          <FactsPanel
            contactId={contact.id}
            firstName={contact.firstName}
            facts={profile.facts.map((f) => ({ ...f, category: f.category as keyof typeof factCategoryLabels }))}
          />
        </aside>
      </div>
    </>
  );
}
