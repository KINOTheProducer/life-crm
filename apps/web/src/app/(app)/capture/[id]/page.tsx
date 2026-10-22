import { notFound } from "next/navigation";
import { CaptureReview } from "@/components/capture/capture-review";
import { PageHeader } from "@/components/page-header";
import { getCapture } from "@/lib/data/capture";
import { contactOptions } from "@/lib/data/contacts";
import { requireUser, tenantQuery } from "@/lib/session";

export default async function CapturePage({ params }: PageProps<"/capture/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await tenantQuery(async (tx) => {
    const capture = await getCapture(tx, id);
    return capture && { capture, contacts: await contactOptions(tx) };
  });
  if (!data) notFound();
  const { timeZone } = await requireUser();
  const recordedOn = new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone }).format(
    data.capture.createdAt,
  );
  const saved = data.capture.status === "committed";

  return (
    <>
      <PageHeader
        meta={`Recorded ${recordedOn}`}
        title={saved ? "Your note." : "Review your note."}
        aside={saved ? "Already on your timeline." : "Nothing is saved until you say so."}
        description={
          saved
            ? "Fix the transcript if anything was misheard, then read it again. You'll review the changes before they replace what this note added."
            : "Untick anything that's wrong and fix names, then save."
        }
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
          rereading: !!data.capture.committedAt,
          contextName: data.contacts.find((c) => c.id === data.capture.contextContactId)?.name ?? null,
        }}
        contacts={data.contacts}
      />
    </>
  );
}
