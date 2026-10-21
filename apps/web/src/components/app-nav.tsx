"use client";

import { Bell, CircleDot, Home, Images, LogOut, MapPin, MessageCircleQuestion, Mic, Network, Search, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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

/** Narrow icon rail. Labels show as tooltips and to screen readers. */
export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="flex h-full flex-col items-center gap-2 py-5">
      <Link href="/dashboard" aria-label="Home" className="type-display mb-5 text-[1.75rem] italic">
        {APP_NAME.charAt(0).toLowerCase()}
      </Link>
      <button
        type="button"
        aria-label="Search and commands (Ctrl or ⌘ K)"
        title="Search and commands (⌘K)"
        onClick={() => window.dispatchEvent(new Event("open-palette"))}
        className="grid size-11 place-items-center rounded-2xl text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
      >
        <Search className="size-[18px]" strokeWidth={1.8} />
      </button>
      {links.map(({ href, label, icon: Icon }) => (
        <RailLink key={href} href={href} label={label} active={pathname.startsWith(href.replace("/new", ""))}>
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
          onClick={async () => {
            await authClient.signOut();
            router.push("/sign-in");
          }}
        >
          <LogOut className="size-[18px]" strokeWidth={1.8} />
        </button>
      </div>
    </nav>
  );
}
