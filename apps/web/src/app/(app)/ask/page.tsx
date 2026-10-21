import { AskForm } from "@/components/ask/ask-form";
import { PageHeader } from "@/components/page-header";
import { aiEnabledFor } from "@/lib/ai";
import { tenantQuery } from "@/lib/session";

export default async function AskPage({ searchParams }: PageProps<"/ask">) {
  const { q } = await searchParams;
  const enabled = await tenantQuery((tx, user) => aiEnabledFor(tx, user.id));
  return (
    <div className="mx-auto grid max-w-3xl">
      <PageHeader title="Ask." aside="Anything you've noted down." />
      {enabled ? (
        <AskForm initial={typeof q === "string" ? q.slice(0, 500) : ""} />
      ) : (
        <p className="text-muted-foreground">AI features are off. Turn them on in Settings to ask questions about your people.</p>
      )}
    </div>
  );
}
