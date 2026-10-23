"use client";

import {
  Bell,
  ChevronRight,
  CircleDot,
  Home,
  House,
  Images,
  LayoutGrid,
  LogOut,
  MapPin,
  MessageCircleQuestion,
  Mic,
  Network,
  Search,
  Settings,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { authClient } from "@/lib/auth-client";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/people", label: "People", icon: Users },
  { href: "/circles", label: "Circles", icon: CircleDot },
  { href: "/family", label: "Family", icon: Network },
  { href: "/places", label: "Places", icon: MapPin },
  { href: "/memories", label: "Memories", icon: Images },
  { href: "/reminders", label: "Reminders", icon: Bell },
  { href: "/ask", label: "Ask", icon: MessageCircleQuestion },
  { href: "/capture/new", label: "Voice notes", icon: Mic },
] as const;

/** What the phone's More sheet holds: everything without its own tab. */
const moreTiles = [
  { href: "/circles", label: "Circles", hint: "Groups and crews", icon: CircleDot, tone: "bg-peach" },
  { href: "/family", label: "Family", hint: "Your tree", icon: Network, tone: "bg-sage" },
  { href: "/memories", label: "Memories", hint: "Photos and moments", icon: Images, tone: "bg-lilac" },
  { href: "/places", label: "Places", hint: "Who lives where", icon: MapPin, tone: "bg-sky" },
] as const;
const moreRows = [
  { href: "/ask", label: "Ask", icon: MessageCircleQuestion },
  { href: "/households", label: "Households and holiday cards", icon: House },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
const moreRoutes = [...moreTiles, ...moreRows].map((l) => l.href);

const isActive = (pathname: string, href: string) => pathname.startsWith(href.replace("/new", ""));

const openPalette = () => window.dispatchEvent(new Event("open-palette"));

function useSignOut() {
  const router = useRouter();
  return async () => {
    await authClient.signOut();
    router.push("/sign-in");
  };
}

function RailLink({ href, label, active, children }: { href: string; label: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "grid size-11 place-items-center rounded-2xl text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
        active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
      )}
    >
      {children}
    </Link>
  );
}

/** Narrow icon rail for wide screens. Labels show as tooltips and to screen readers. */
export function AppNav() {
  const pathname = usePathname();
  const signOut = useSignOut();

  return (
    <nav className="flex h-full flex-col items-center gap-2 py-5">
      <Link href="/dashboard" aria-label="Home" className="type-display mb-5 text-[1.75rem] italic">
        {APP_NAME.charAt(0).toLowerCase()}
      </Link>
      <button
        type="button"
        aria-label="Search and commands (Ctrl or ⌘ K)"
        title="Search and commands (⌘K)"
        onClick={openPalette}
        className="grid size-11 place-items-center rounded-2xl text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
      >
        <Search className="size-[18px]" strokeWidth={1.8} />
      </button>
      {links.map(({ href, label, icon: Icon }) => (
        <RailLink key={href} href={href} label={label} active={isActive(pathname, href)}>
          <Icon className="size-[18px]" strokeWidth={1.8} />
        </RailLink>
      ))}
      <div className="mt-auto grid gap-2">
        <RailLink href="/settings" label="Settings" active={pathname.startsWith("/settings")}>
          <Settings className="size-[18px]" strokeWidth={1.8} />
        </RailLink>
        <button
          type="button"
          aria-label="Sign out"
          title="Sign out"
          className="grid size-11 place-items-center rounded-2xl text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          onClick={signOut}
        >
          <LogOut className="size-[18px]" strokeWidth={1.8} />
        </button>
      </div>
    </nav>
  );
}

/** Phone header: the logo and a search pill that opens the command palette. */
export function MobileTopBar() {
  return (
    <header className="flex items-center gap-2.5 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-2 md:hidden">
      <Link href="/dashboard" aria-label="Home" className="type-display w-8 text-[1.875rem] leading-none italic">
        {APP_NAME.charAt(0).toLowerCase()}
      </Link>
      <button
        type="button"
        onClick={openPalette}
        className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-card px-4 text-left text-[15px] text-muted-foreground"
      >
        <Search className="size-[18px] shrink-0" strokeWidth={1.8} />
        <span className="truncate">Search people, notes…</span>
      </button>
    </header>
  );
}

function TabLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground", active && "font-medium text-foreground")}
    >
      <Icon className="size-[22px]" strokeWidth={active ? 2.1 : 1.8} />
      {label}
    </Link>
  );
}

/** Phone tab bar: the four places people go most, a record button in the middle, and More for the rest. */
export function MobileNav() {
  const pathname = usePathname();
  const signOut = useSignOut();
  const sheet = useRef<HTMLDialogElement>(null);
  const moreActive = moreRoutes.some((href) => pathname.startsWith(href));

  // Close the sheet when a link in it navigates.
  useEffect(() => {
    sheet.current?.close();
  }, [pathname]);

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-center border-t border-border bg-card/95 px-2 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+0.375rem)] backdrop-blur md:hidden"
      >
        <TabLink href="/dashboard" label="Home" icon={Home} active={isActive(pathname, "/dashboard")} />
        <TabLink href="/people" label="People" icon={Users} active={isActive(pathname, "/people")} />
        <Link
          href="/capture/new"
          aria-label="Record a voice note"
          aria-current={isActive(pathname, "/capture/new") ? "page" : undefined}
          className="relative grid size-14 place-items-center justify-self-center rounded-full bg-primary text-primary-foreground"
        >
          <Mic className="size-[22px]" strokeWidth={1.8} />
          <span className="absolute top-3 right-3 size-2 rounded-full bg-coral" aria-hidden />
        </Link>
        <TabLink href="/reminders" label="Reminders" icon={Bell} active={isActive(pathname, "/reminders")} />
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => sheet.current?.showModal()}
          className={cn("flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground", moreActive && "font-medium text-foreground")}
        >
          <LayoutGrid className="size-[22px]" strokeWidth={moreActive ? 2.1 : 1.8} />
          More
        </button>
      </nav>

      <dialog
        ref={sheet}
        aria-label="More"
        onClick={(e) => e.target === sheet.current && sheet.current.close()}
        className="mx-0 mt-auto mb-0 w-full max-w-none rounded-t-[1.75rem] bg-background p-0 text-foreground backdrop:bg-black/40 md:hidden"
      >
        <div className="grid gap-3 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <div className="flex items-center justify-between pl-1">
            <p className="type-display text-[2rem]">More</p>
            <button type="button" aria-label="Close" onClick={() => sheet.current?.close()} className="grid size-11 place-items-center rounded-full bg-card">
              <X className="size-5" strokeWidth={1.8} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {moreTiles.map(({ href, label, hint, icon: Icon, tone }) => (
              <Link key={href} href={href} className={cn("flex min-h-24 flex-col justify-between gap-4 rounded-[1.25rem] p-3.5 text-foreground", tone)}>
                <Icon className="size-[22px]" strokeWidth={1.8} />
                <span className="grid">
                  <span className="font-medium">{label}</span>
                  <span className="text-[13px] text-foreground/75">{hint}</span>
                </span>
              </Link>
            ))}
          </div>
          <ul className="divide-y divide-border rounded-3xl bg-card px-4">
            {moreRows.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="flex min-h-14 items-center gap-3.5">
                  <Icon className="size-5" strokeWidth={1.8} />
                  <span className="flex-1">{label}</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
            <li>
              <button type="button" onClick={signOut} className="flex min-h-14 w-full items-center gap-3.5 text-left text-accent-ink">
                <LogOut className="size-5" strokeWidth={1.8} />
                Sign out
              </button>
            </li>
          </ul>
        </div>
      </dialog>
    </>
  );
}
