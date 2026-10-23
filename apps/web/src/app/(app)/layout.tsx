import { Suspense } from "react";
import { AppNav, MobileNav, MobileTopBar } from "@/components/app-nav";
import { CommandPalette } from "@/components/palette/command-palette";

// Every page here reads the session, so none can be fully prerendered.
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[76px_1fr]">
      <aside className="hidden md:block">
        <div className="sticky top-0 h-screen">
          <AppNav />
        </div>
      </aside>
      <MobileTopBar />
      {/* Bottom padding on phones clears the fixed tab bar. */}
      <main className="min-w-0 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] md:py-8 md:pr-9 md:pl-3">
        <div className="mx-auto max-w-[1240px]">
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>{children}</Suspense>
        </div>
      </main>
      <MobileNav />
      <CommandPalette />
    </div>
  );
}
