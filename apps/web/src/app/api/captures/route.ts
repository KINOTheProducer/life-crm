import { withTenant } from "@life-crm/db";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createVoiceCapture, MAX_AUDIO_BYTES, processCapture } from "@/lib/data/capture";
import { db } from "@/lib/db";

const fieldsSchema = z.object({
  durationMs: z.coerce.number().int().min(0).max(60 * 60 * 1000).nullable(),
  contextContactId: z.uuid().nullable(),
});

/** Upload a voice note. Transcription and extraction continue after the response. */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  const user = session?.user;
  if (!user?.tenantId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "No audio received" }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Recording is too large (25 MB max)" }, { status: 413 });
  }
  if (!audio.type.startsWith("audio/") && !audio.type.startsWith("video/webm")) {
    return NextResponse.json({ error: "That file isn't audio" }, { status: 415 });
  }
  const fields = fieldsSchema.safeParse({
    durationMs: form.get("durationMs") || null,
    contextContactId: form.get("contextContactId") || null,
  });
  if (!fields.success) return NextResponse.json({ error: "Invalid fields" }, { status: 400 });

  const tenantId = user.tenantId;
  const timeZone = user.timeZone ?? "America/Toronto";
  const bytes = Buffer.from(await audio.arrayBuffer());
  const id = await withTenant(db, tenantId, (tx) =>
    createVoiceCapture(tx, {
      tenantId,
      userId: user.id,
      audio: bytes,
      mime: audio.type,
      durationMs: fields.data.durationMs,
      contextContactId: fields.data.contextContactId,
    }),
  );

  after(() => processCapture(tenantId, id, timeZone));
  return NextResponse.json({ id }, { status: 201 });
}
