import Link from "next/link";
import { eq, schema } from "@life-crm/db";
import { PageHeader } from "@/components/page-header";
import { CalendarFeed } from "@/components/settings/calendar-feed";
import { CheckNow } from "@/components/settings/check-now";
import { PushToggle } from "@/components/settings/push-toggle";
import { RelationshipSettingsForm } from "@/components/settings/relationship-form";
import { SettingsForm } from "@/components/settings/settings-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SelfFace } from "@/components/faces/faces";
import { ImmichForm } from "@/components/settings/immich-form";
import { db } from "@/lib/db";
import { immichConnection } from "@/lib/immich";
import { requireUser, tenantQuery } from "@/lib/session";

export default async function SettingsPage() {
  const me = await requireUser();
  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, me.id));
  const timeZones = ["UTC", ...Intl.supportedValuesOf("timeZone")];
  const immich = await tenantQuery((tx) => immichConnection(tx, me.id));

  return (
    <>
      <PageHeader title="Settings." aside="You, and how we remind you." />
      <div className="grid max-w-3xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <SettingsForm
              timeZone={u!.timeZone}
              timeZones={timeZones}
              digestHour={u!.digestHour}
              emailDigest={u!.emailDigest}
              leadDays={u!.reminderLeadDays}
              emailConfigured={Boolean(process.env.SMTP_URL)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Relationship</CardTitle>
          </CardHeader>
          <CardContent>
            <RelationshipSettingsForm status={u!.relationshipStatus} style={u!.relationshipStyle} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Immich</CardTitle>
          </CardHeader>
          <CardContent>
            <ImmichForm connected={immich && { baseUrl: immich.baseUrl, accountName: immich.accountName }} />
          </CardContent>
          {immich && (
            <CardContent className="grid gap-4 border-t border-border pt-6">
              <SelfFace personId={immich.selfPersonId} />
              <Link href="/people/faces" className="text-sm font-medium underline-offset-4 hover:underline">
                Match faces to your people
              </Link>
            </CardContent>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Your data</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <p className="text-muted-foreground">Everything you&apos;ve entered is yours. Take it anywhere, any time.</p>
            <div className="flex flex-wrap gap-2">
              <a href="/api/export/json" download className={buttonVariants({ variant: "outline", size: "sm" })}>
                Everything (JSON)
              </a>
              <a href="/api/export/vcf" download className={buttonVariants({ variant: "outline", size: "sm" })}>
                Contacts (vCard)
              </a>
              <a href="/api/export/csv" download className={buttonVariants({ variant: "outline", size: "sm" })}>
                Contacts (CSV)
              </a>
            </div>
            <div className="flex flex-wrap gap-4">
              <Link href="/people/import" className="font-medium underline-offset-4 hover:underline">
                Import contacts
              </Link>
              <Link href="/people/trash" className="font-medium underline-offset-4 hover:underline">
                Trash
              </Link>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Browser notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <PushToggle publicKey={process.env.VAPID_PUBLIC_KEY || null} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
          </CardHeader>
          <CardContent>
            <CalendarFeed enabled={Boolean(u!.calendarTokenHash)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Run today&apos;s reminders</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              Reminders are checked automatically at your daily time. Use this to check right away.
            </p>
            <CheckNow />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
