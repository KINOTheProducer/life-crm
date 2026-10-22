import { notFound } from "next/navigation";
import { CaptureReview } from "@/components/capture/capture-review";
import { PageHeader } from "@/components/page-header";
import { getCapture } from "@/lib/data/capture";
import { contactOptions } from "@/lib/data/contacts";
import { tenantQuery } from "@/lib/session";

export default async function CapturePage({ params }: PageProps<"/capture/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await tenantQuery(async (tx) => {
    const capture = await getCapture(tx, id);
    return capture && { capture, contacts: await contactOptions(tx) };
  });
  if (!data) notFound();

  return (
    <>
      <PageHeader
        title="Review your note."
        aside="Nothing is saved until you say so."
        description="Untick anything that's wrong and fix names, then save."
      />
      {/* Remount on status change so drafts reset from the fresh extraction. */}
      <CaptureReview
        key={data.capture.status}
        capture={{
          id: data.capture.id,
          status: data.capture.status,
          transcript: data.capture.transcript,
          extraction: data.capture.extraction,
          progress: data.capture.progress ?? [],
          error: data.capture.error,
          durationMs: data.capture.durationMs,
          contextName: data.contacts.find((c) => c.id === data.capture.contextContactId)?.name ?? null,
        }}
        contacts={data.contacts}
      />
    </>
  );
}
