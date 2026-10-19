import { Suspense } from "react";
import { AppNav } from "@/components/app-nav";

// Every page here reads the session, so none can be fully prerendered.
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr]">
      <aside className="border-r border-sidebar-border bg-sidebar">
        <div className="sticky top-0 h-screen">
          <AppNav />
        </div>
      </aside>
      <main className="bg-gridlines min-w-0 px-12 py-12">
        <div className="mx-auto max-w-6xl">
          <Suspense fallback={<p className="type-label text-muted-foreground">Loading…</p>}>{children}</Suspense>
        </div>
      </main>
    </div>
  );
}
