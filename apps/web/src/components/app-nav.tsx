"use client";

import { Bell, LayoutDashboard, LogOut, Mic, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/people", label: "People", icon: Users },
  { href: "/reminders", label: "Reminders", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="flex h-full flex-col gap-1 px-4 py-6">
      <Link href="/dashboard" className="type-display px-3 pb-6 text-3xl">
        Life CRM
      </Link>
      <Link href="/capture/new" className={cn(buttonVariants({ variant: "accent" }), "mb-6 justify-start")}>
        <Mic />
        Voice note
      </Link>
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "type-label relative flex items-center gap-2.5 rounded-full px-3 py-2.5 text-muted-foreground transition-colors hover:text-foreground",
              active && "bg-sidebar-accent text-foreground",
            )}
          >
            {active && <span aria-hidden className="absolute -left-4 top-1/2 h-5 w-px -translate-y-1/2 bg-foreground" />}
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
      <button
        type="button"
        className="type-label mt-auto flex items-center gap-2.5 rounded-full px-3 py-2.5 text-muted-foreground transition-colors hover:text-foreground"
        onClick={async () => {
          await authClient.signOut();
          router.push("/sign-in");
        }}
      >
        <LogOut className="size-4" />
        Sign out
      </button>
    </nav>
  );
}
