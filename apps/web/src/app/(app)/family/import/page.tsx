import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { GedcomImport } from "@/components/family/gedcom-import";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";

export default function FamilyImportPage() {
  return (
    <>
      <Link href="/family" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Family
      </Link>
      <PageHeader
        title="Bring in a tree."
        aside="GEDCOM, from any genealogy app."
        description="New relatives come in as acquaintances with no catch-up reminders. People you already have are matched by name and birth year, and only their blanks get filled."
        actions={
          <a href="/api/export/ged" download className={buttonVariants({ variant: "outline" })}>
            <Download />
            Export your tree
          </a>
        }
      />
      <div className="max-w-2xl rounded-3xl bg-card p-8">
        <GedcomImport />
      </div>
    </>
  );
}
