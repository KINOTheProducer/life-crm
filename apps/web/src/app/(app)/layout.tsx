import { Suspense } from "react";
import { AppNav } from "@/components/app-nav";
import { CommandPalette } from "@/components/palette/command-palette";

// Every page here reads the session, so none can be fully prerendered.
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen grid-cols-[76px_1fr]">
      <aside>
        <div className="sticky top-0 h-screen">
          <AppNav />
        </div>
      </aside>
      <main className="min-w-0 py-8 pr-9 pl-3">
        <div className="mx-auto max-w-[1240px]">
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>{children}</Suspense>
        </div>
      </main>
      <CommandPalette />
    </div>
  );
}
