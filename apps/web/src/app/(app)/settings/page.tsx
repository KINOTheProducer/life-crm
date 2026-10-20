import { eq, schema } from "@life-crm/db";
import { PageHeader } from "@/components/page-header";
import { CalendarFeed } from "@/components/settings/calendar-feed";
import { CheckNow } from "@/components/settings/check-now";
import { PushToggle } from "@/components/settings/push-toggle";
import { RelationshipSettingsForm } from "@/components/settings/relationship-form";
import { SettingsForm } from "@/components/settings/settings-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function SettingsPage() {
  const me = await requireUser();
  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, me.id));
  const timeZones = ["UTC", ...Intl.supportedValuesOf("timeZone")];

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
