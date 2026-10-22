import { ArrowRight, Bell, CalendarDays, Camera, Clock3, Lock, Mic } from "lucide-react";
import Link from "next/link";
import { HeroReveal } from "@/components/landing/hero-reveal";
import { BirthdayCard, DriftingCard, VoiceNoteCard } from "@/components/landing/product-cards";
import { StorySection } from "@/components/landing/story/story-section";
import { buttonVariants } from "@/components/ui/button";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";
import hero from "../../../public/images/hero-dinner.jpg";

const features = [
  {
    icon: Bell,
    tone: "bg-peach",
    title: "Never miss a birthday",
    body: "Reminders two weeks out, a few days before and on the day. By email, in your browser, or straight into your calendar.",
  },
  {
    icon: Mic,
    tone: "bg-butter",
    title: "Talk, don't type",
    body: "After you see someone, record a quick note. Names, kids, jobs and plans get filed on the right person for you to check.",
  },
  {
    icon: Clock3,
    tone: "bg-sage",
    title: "Know who you've drifted from",
    body: "Pick how often you want to see each person. We'll nudge you when it's been too long.",
  },
  {
    icon: CalendarDays,
    tone: "bg-lilac",
    title: "Everything in one timeline",
    body: "Every catch-up, note and detail on one page per person, so you walk into dinner already remembering.",
  },
  {
    icon: Camera,
    tone: "bg-sky",
    title: "Your photos, linked",
    body: "Connect Immich and photos of you and your people show up on their profile automatically.",
  },
  {
    icon: Lock,
    tone: "bg-rose",
    title: "Private by default",
    body: "Run it on your own server next to Immich, or use our hosted version. Your notes are never used to train anything.",
  },
];


export default function LandingPage() {
  return (
    <div className="bg-background">
      {/* Hero */}
      <section className="relative isolate min-h-[min(100vh,920px)] overflow-hidden bg-[#2a211b] text-white">
        {/* Strong scrim on the left and bottom so the copy always reads, whatever the photo does. */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/85 via-black/55 to-black/5" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
        {/* On narrow screens the copy spans the whole photo, so darken all of it. */}
        <div className="absolute inset-0 -z-10 bg-black/40 lg:hidden" />

        <HeroReveal src={hero} alt="Friends sharing dinner at a long table">
          <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 pt-6 lg:px-10">
            <Link href="/" className="type-display text-[1.75rem] italic">
              {APP_NAME}
            </Link>
            <div className="hidden items-center gap-8 text-sm text-white/85 md:flex">
              <a href="#how" className="hover:text-white">How it works</a>
              <a href="#features" className="hover:text-white">Features</a>
              <a href="#self-host" className="hover:text-white">Self-host</a>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/sign-in" className="rounded-full px-4 py-2 text-sm text-white/90 hover:text-white">
                Sign in
              </Link>
              <Link href="/sign-up" className={cn(buttonVariants(), "bg-white text-foreground hover:bg-white/90")}>
                Get started
              </Link>
            </div>
          </nav>

          <div className="mx-auto grid max-w-7xl items-end gap-12 px-6 pt-24 pb-20 lg:grid-cols-[1.15fr_1fr] lg:px-10 lg:pt-40">
            <div className="max-w-2xl [text-shadow:0_1px_24px_rgb(0_0_0/0.35)]">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-sm backdrop-blur">
                <span className="size-1.5 rounded-full bg-coral" />
                A personal CRM for friends and family
              </p>
              <h1 className="type-display text-[3.5rem] leading-[0.98] sm:text-[4.75rem] lg:text-[5.5rem]">
                Remember the people <em className="text-[#ffd4c4]">you love.</em>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/90">
                {APP_NAME} keeps track of birthdays, kids&apos; names, what everyone&apos;s up to and when you last caught up. Record a
                quick voice note after you see someone, and it&apos;s all there next time.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/sign-up" className={cn(buttonVariants({ size: "lg" }), "bg-white text-foreground hover:bg-white/90")}>
                  Start for free
                  <ArrowRight />
                </Link>
                <a href="#self-host" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "border-white/40 bg-white/10 text-white backdrop-blur hover:bg-white/20 hover:text-white")}>
                  Self-host it
                </a>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/85">
                <li>Birthday reminders</li>
                <li>Voice notes</li>
                <li>Keep-in-touch nudges</li>
                <li>Immich photos</li>
              </ul>
            </div>
            <div aria-hidden className="relative hidden h-[500px] lg:block">
              <BirthdayCard className="absolute top-0 right-4 rotate-[1.5deg]" />
              <VoiceNoteCard className="absolute top-40 -left-4 z-10 -rotate-2" />
              <DriftingCard className="absolute right-0 bottom-0" />
            </div>
          </div>
        </HeroReveal>
      </section>

      {/* How it works: scroll-driven 3D story */}
      <StorySection />

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, tone, title, body }) => (
            <div key={title} className="rounded-3xl bg-card p-7">
              <span className={cn("grid size-11 place-items-center rounded-2xl", tone)}>
                <Icon className="size-5" strokeWidth={1.8} />
              </span>
              <h3 className="mt-5 text-lg font-medium">{title}</h3>
              <p className="mt-2 text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Self-host / hosted */}
      <section id="self-host" className="bg-foreground text-background">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-24 lg:grid-cols-2 lg:px-10">
          <h2 className="type-display text-5xl leading-[1.05]">
            Your server or ours. <em className="text-background/60">Your people either way.</em>
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
              <h3 className="text-lg font-medium">Self-hosted</h3>
              <p className="mt-2 text-background/70">One Docker Compose file. Runs next to Immich. Bring your own AI model or use a local one.</p>
              <Link href="https://github.com/KINOTheProducer/life-crm" className="mt-5 inline-flex items-center gap-1.5 text-sm underline underline-offset-4">
                Install guide <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <div className="rounded-3xl bg-white p-6 text-foreground">
              <h3 className="text-lg font-medium">Hosted</h3>
              <p className="mt-2 text-muted-foreground">Nothing to set up. Data stored in Canada, export or delete it any time.</p>
              <Link href="/sign-up" className={cn(buttonVariants(), "mt-5")}>
                Start for free
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-10 text-sm text-muted-foreground lg:px-10">
        <span className="type-display text-xl text-foreground italic">{APP_NAME}</span>
        <span>Made in Toronto.</span>
      </footer>
    </div>
  );
}
