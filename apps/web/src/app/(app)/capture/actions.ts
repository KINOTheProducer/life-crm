"use server";

import { and, eq, inArray, schema } from "@life-crm/db";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { CaptureError, commitCapture, commitSchema, processCapture } from "@/lib/data/capture";
import { requireUser, tenantQuery } from "@/lib/session";

export interface ActionState {
  error?: string;
}

export async function saveCapture(captureId: string, payload: unknown): Promise<ActionState> {
  const parsed = commitSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Some fields are invalid" };

  let contactIds: string[];
  try {
    contactIds = await tenantQuery((tx, user) => commitCapture(tx, user.tenantId, captureId, parsed.data));
  } catch (error) {
    if (error instanceof CaptureError) return { error: error.message };
    console.error("Saving capture failed", error);
    return { error: "Could not save this note. Please try again." };
  }
  redirect(contactIds[0] ? `/people/${contactIds[0]}` : "/people");
}

export async function discardCapture(captureId: string) {
  const [row] = await tenantQuery((tx) =>
    tx
      .select({ committedAt: schema.captures.committedAt })
      .from(schema.captures)
      .where(and(eq(schema.captures.id, captureId), inArray(schema.captures.status, ["ready", "failed"]))),
  );
  if (!row) redirect("/capture/new");
  // Discarding a re-read of a saved note keeps what was saved the first time.
  await tenantQuery((tx) =>
    tx
      .update(schema.captures)
      .set(row.committedAt ? { status: "committed", extraction: null, error: null } : { status: "discarded", audio: null })
      .where(eq(schema.captures.id, captureId)),
  );
  redirect(row.committedAt ? `/capture/${captureId}` : "/capture/new");
}

/** Re-run extraction on an edited transcript, or on a note that was already saved. */
export async function reprocessCapture(captureId: string, transcript: string) {
  const user = await requireUser();
  const text = transcript.trim().slice(0, 20000);
  await tenantQuery((tx) =>
    tx
      .update(schema.captures)
      .set({ status: "extracting", transcript: text, extraction: null, progress: null, error: null })
      .where(and(eq(schema.captures.id, captureId), inArray(schema.captures.status, ["ready", "failed", "committed"]))),
  );
  after(() => processCapture(user.tenantId, captureId, user.timeZone, text));
}

/** Start over from the audio after a failure (e.g. the speech-to-text server was down). */
export async function retryCapture(captureId: string) {
  const user = await requireUser();
  const rows = await tenantQuery((tx) =>
    tx
      .update(schema.captures)
      .set({ status: "transcribing", error: null })
      .where(and(eq(schema.captures.id, captureId), eq(schema.captures.status, "failed")))
      .returning({ id: schema.captures.id }),
  );
  if (rows.length > 0) after(() => processCapture(user.tenantId, captureId, user.timeZone));
}
