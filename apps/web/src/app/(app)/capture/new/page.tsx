import { desc, eq, schema } from "@life-crm/db";
import Link from "next/link";
import { VoiceRecorder } from "@/components/capture/voice-recorder";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fullName } from "@/lib/data/contacts";
import { tenantQuery } from "@/lib/session";

const statusLabel = {
  transcribing: "Transcribing",
  extracting: "Extracting",
  ready: "Needs review",
  committed: "Saved",
  failed: "Failed",
  discarded: "Discarded",
} as const;

const when = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function NewCapturePage({ searchParams }: PageProps<"/capture/new">) {
  const { contact } = await searchParams;
  const contactId = typeof contact === "string" && /^[0-9a-f-]{36}$/.test(contact) ? contact : undefined;

  const { context, recent } = await tenantQuery(async (tx) => {
    const [context] = contactId
      ? await tx
          .select({ id: schema.contacts.id, firstName: schema.contacts.firstName, lastName: schema.contacts.lastName })
          .from(schema.contacts)
          .where(eq(schema.contacts.id, contactId))
      : [];
    const recent = await tx
      .select({ id: schema.captures.id, status: schema.captures.status, createdAt: schema.captures.createdAt, transcript: schema.captures.transcript })
      .from(schema.captures)
      .orderBy(desc(schema.captures.createdAt))
      .limit(8);
    return { context, recent };
  });

  return (
    <>
      <PageHeader
        eyebrow="Capture"
        title="Talk it through"
        description="Just met someone, or caught up with an old friend? Say what you want to remember."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardContent>
            <VoiceRecorder contextContactId={context?.id} contextName={context ? fullName(context) : undefined} />
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <p className="type-label text-muted-foreground">Recent</p>
            <CardTitle>Voice notes</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((c) => (
                  <li key={c.id}>
                    <Link href={`/capture/${c.id}`} className="grid gap-1 py-3 hover:opacity-80">
                      <span className="flex items-center justify-between gap-2">
                        <span className="type-label text-muted-foreground">{when.format(c.createdAt)}</span>
                        <Badge variant={c.status === "ready" ? "accent" : c.status === "failed" ? "destructive" : "outline"}>
                          {statusLabel[c.status]}
                        </Badge>
                      </span>
                      {c.transcript && <span className="line-clamp-2 text-sm">{c.transcript}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
