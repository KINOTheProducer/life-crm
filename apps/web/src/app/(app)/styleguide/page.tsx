import { ArrowRight, Mic } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const swatches = [
  ["--paper-50", "Card"],
  ["--paper-100", "Page"],
  ["--paper-200", "Sidebar / muted"],
  ["--paper-300", "Rule"],
  ["--espresso-700", "Ink"],
  ["--espresso-500", "Muted ink"],
  ["--espresso-900", "Dark page"],
  ["--terracotta-500", "Accent"],
  ["--terracotta-300", "Accent on dark"],
  ["--raspberry-600", "Destructive"],
] as const;

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-5 border-t border-border py-10">
      <p className="type-label text-muted-foreground">{label}</p>
      {children}
    </section>
  );
}

export default function StyleguidePage() {
  return (
    <>
      <PageHeader
        eyebrow="Design system"
        title={
          <>
            Light paper, espresso ink, <em className="text-accent-ink">terracotta</em>
          </>
        }
        description="Tokens and components used across Life CRM. Source of truth: docs/DESIGN.md and globals.css."
      />

      <Section label="Colour">
        <div className="grid grid-cols-3 gap-3 lg:grid-cols-10">
          {swatches.map(([token, name]) => (
            <div key={token} className="grid gap-2">
              <div className="h-20 rounded-2xl ring-1 ring-foreground/10" style={{ background: `var(${token})` }} />
              <p className="type-label">{name}</p>
              <p className="font-mono text-xs text-muted-foreground">{token}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section label="Type">
        <div className="grid gap-4">
          <p className="type-display text-7xl">Display 72</p>
          <p className="type-display text-5xl">Page title 48</p>
          <p className="type-display text-2xl">Card title 24</p>
          <p className="max-w-xl text-lg">Lead 18. Sarah mentioned she&apos;s training for the Toronto Waterfront marathon in October.</p>
          <p className="max-w-xl">Body 16. Met at Jay&apos;s wedding, works as a nurse at Sunnybrook, dog named Biscuit.</p>
          <p className="text-sm text-muted-foreground">Small muted 14. Last talked 23 days ago.</p>
          <p className="type-label">Label mono 12 · uppercase</p>
        </div>
      </Section>

      <Section label="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="accent">Get started</Button>
          <Button>Save person</Button>
          <Button variant="outline">Sign in</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="destructive">Delete</Button>
          <Button variant="accent" size="icon" aria-label="Record voice note">
            <Mic />
          </Button>
          <Button variant="accent" size="icon-sm" aria-label="Continue">
            <ArrowRight />
          </Button>
          <Button size="lg" variant="accent">Large</Button>
          <Button size="sm" variant="outline">Small</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section label="Chips">
        <div className="flex flex-wrap gap-2">
          <Badge>Climbing</Badge>
          <Badge>Uni crew</Badge>
          <Badge variant="accent">Birthday today</Badge>
          <Badge variant="secondary">Inner circle</Badge>
          <Badge variant="destructive">Allergy: peanuts</Badge>
        </div>
      </Section>

      <Section label="Cards & forms">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <p className="type-label text-muted-foreground">Next 30 days</p>
              <CardTitle>Birthdays</CardTitle>
              <CardDescription>Cards use a 32px radius on paper, never a drop shadow.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sg-name">Name</Label>
                <Input id="sg-name" placeholder="Sarah Chen" />
              </div>
              <Button variant="accent" className="justify-self-start">
                Save
              </Button>
            </CardContent>
          </Card>
          <div className="dark flex flex-col justify-between gap-8 rounded-[2rem] bg-background p-8 text-foreground">
            <p className="type-label text-muted-foreground">Dark surface</p>
            <p className="type-display text-4xl">
              You haven&apos;t talked to <em className="text-accent-ink">Mike</em> in 47 days.
            </p>
            <div className="flex gap-2">
              <Button variant="accent">Log a catch-up</Button>
              <Button variant="outline">Snooze</Button>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
