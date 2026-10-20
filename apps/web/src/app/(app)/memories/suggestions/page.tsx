import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suggestions } from "@/components/memories/suggestions";
import { PageHeader } from "@/components/page-header";

export default function SuggestionsPage() {
  return (
    <>
      <Link href="/memories" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Memories
      </Link>
      <PageHeader
        title="From your photos."
        aside="Times worth keeping?"
        description="Days with lots of photos of your people that aren't memories yet. Fix the title, untick anyone who wasn't really there, and save it with all its photos."
      />
      <Suggestions />
    </>
  );
}
