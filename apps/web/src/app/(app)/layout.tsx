import { Suspense } from "react";
import { AppNav } from "@/components/app-nav";

// Every page here reads the session, so none can be fully prerendered.
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen grid-cols-[220px_1fr]">
      <aside className="border-r bg-muted/30">
        <AppNav />
      </aside>
      <main className="min-w-0 p-8">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>{children}</Suspense>
      </main>
    </div>
  );
}
