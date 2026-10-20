import { partneredStatuses } from "@life-crm/core";
import { eq, schema } from "@life-crm/db";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { APP_NAME } from "@/lib/brand";
import { fullName } from "@/lib/data/contacts";
import { currentPartners, userPrefs } from "@/lib/data/partners";
import { db } from "@/lib/db";
import { requireUser, tenantQuery } from "@/lib/session";
import { cn } from "@/lib/utils";
import { skipOnboarding } from "./actions";
import { FamilyForm, PartnerForm, PeopleForm, RelationshipForm, RemindersForm, YouForm } from "./forms";
import { nextStep, parseStep, steps, stepTitles, type Step } from "./steps";

export const instant = false;

const copy: Record<Step, { title: string; aside: string; description: string }> = {
  you: { title: "Welcome.", aside: "Let's set you up.", description: "A few quick questions so the first thing you see is already useful. Skip anything." },
  relationship: { title: "Are you seeing someone?", aside: "", description: "Partners get the deepest profile here: anniversaries, date nights, love languages, sizes, gift ideas." },
  partners: { title: "Tell us about them.", aside: "The rest can come later.", description: "" },
  family: { title: "Your family.", aside: "Birthdays included.", description: "Parents, siblings, kids, anyone whose birthday you'd hate to miss." },
  people: { title: "Five people", aside: "you'd hate to drift from.", description: "We'll nudge you when it's been too long." },
  reminders: { title: "Last thing.", aside: "When should we remind you?", description: "Birthdays, anniversaries and catch-ups, all in one daily nudge." },
};

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const step = parseStep((await searchParams).step);
  const me = await requireUser();
  const { prefs, partners } = await tenantQuery(async (tx) => ({
    prefs: await userPrefs(tx, me.id),
    partners: await currentPartners(tx),
  }));
  const partnered = prefs.relationshipStatus != null && partneredStatuses.includes(prefs.relationshipStatus);
  const polyamorous = prefs.relationshipStyle === "polyamorous";
  const visible = steps.filter((s) => s !== "partners" || partnered);
  const index = visible.indexOf(step);
  const prev = index > 0 ? visible[index - 1] : null;
  const skipTo = nextStep(step, { partnered });
  const c = copy[step];

  let body: React.ReactNode;
  switch (step) {
    case "you": {
      const [u] = await db.select({ name: schema.user.name, timeZone: schema.user.timeZone }).from(schema.user).where(eq(schema.user.id, me.id));
      body = (
        <YouForm
          name={u!.name}
          timeZone={u!.timeZone}
          timeZones={["UTC", ...Intl.supportedValuesOf("timeZone")]}
          suggestBrowserZone={!prefs.onboardedAt}
        />
      );
      break;
    }
    case "relationship":
      body = <RelationshipForm status={prefs.relationshipStatus} polyamorous={polyamorous} />;
      break;
    case "partners":
      if (!polyamorous && partners.length > 0) {
        body = (
          <div className="grid gap-4">
            <p className="text-[15px]">
              {fullName(partners[0]!)} is already set up as your partner.{" "}
              <Link href={`/people/${partners[0]!.contactId}/partner`} className="underline underline-offset-4">
                Open their profile
              </Link>
            </p>
            <Link href={`/onboarding?step=${skipTo}`} className="justify-self-start text-sm font-medium underline underline-offset-4">
              Continue
            </Link>
          </div>
        );
      } else {
        body = <PartnerForm polyamorous={polyamorous} married={prefs.relationshipStatus === "married"} hasPartners={partners.length > 0} />;
      }
      break;
    case "family":
      body = <FamilyForm />;
      break;
    case "people":
      body = <PeopleForm />;
      break;
    case "reminders":
      body = <RemindersForm digestHour={prefs.digestHour} emailDigest={prefs.emailDigest} />;
      break;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid max-w-2xl gap-8 px-6 py-10">
        <div className="flex items-center justify-between">
          <span className="type-display text-[1.75rem] italic">{APP_NAME}</span>
          <form action={skipOnboarding}>
            <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
              Skip setup
            </button>
          </form>
        </div>

        <ol className="flex gap-1.5" aria-label="Progress">
          {visible.map((s, i) => (
            <li key={s} className="flex-1">
              <span className={cn("block h-1 rounded-full bg-border", i <= index && "bg-foreground")} />
              <span className={cn("mt-2 block text-xs text-muted-foreground", s === step && "text-foreground")} aria-current={s === step ? "step" : undefined}>
                {stepTitles[s]}
              </span>
            </li>
          ))}
        </ol>

        <header className="grid gap-2">
          <h1 className="type-display text-[2.75rem] leading-[1.05]">
            {c.title} {c.aside && <em className="text-muted-foreground">{c.aside}</em>}
          </h1>
          {c.description && <p className="text-[15px] text-muted-foreground">{c.description}</p>}
        </header>

        {step === "partners" && partners.length > 0 && polyamorous && (
          <p className="text-[15px]">
            Added so far: {partners.map((p) => fullName(p)).join(", ")}.
          </p>
        )}

        <Card>
          <CardContent>{body}</CardContent>
        </Card>

        <div className="flex items-center justify-between text-sm">
          {prev ? (
            <Link href={`/onboarding?step=${prev}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3.5" />
              Back
            </Link>
          ) : (
            <span />
          )}
          {step !== "reminders" && (
            <Link href={`/onboarding?step=${skipTo}`} className="text-muted-foreground hover:text-foreground">
              Skip this step
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
