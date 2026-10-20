import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Importer } from "@/components/people/importer";

export default function ImportPage() {
  return (
    <>
      <Link href="/people" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        People
      </Link>
      <PageHeader title="Import." aside="Bring your address book." description="Nothing is saved until you check the list. People you already have are matched by phone, email or full name and merged, filling in what's missing." />
      <Importer />
    </>
  );
}
