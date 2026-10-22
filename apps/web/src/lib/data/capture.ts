import "server-only";
import {
  AiError,
  extractionProgress,
  extractionSchema,
  mentionedPeople,
  mentionLine,
  type Extraction,
  type KnownPerson,
  type PartialExtraction,
} from "@life-crm/ai";
import {
  defaultCadenceDays,
  factCategories,
  interactionTypes,
  isValidPartialDate,
  partialDateSchema,
  todayIn,
} from "@life-crm/core";
import { and, eq, inArray, isNull, schema, sql, withTenant, type Tx } from "@life-crm/db";
import { z } from "zod";
import { extractorForUser, transcriberForUser } from "@/lib/ai";
import { db } from "@/lib/db";
import { dateToInstant, formatPartialDate, parseIsoDate, toIsoDate } from "./dates";
import { resolveCheckins } from "./reminders";
import { recordTimeline, type TimelineInput } from "./timeline";

const { captures, contacts, facts, importantDates, interactionPeople, interactions, notes } = schema;

/** An error whose message is safe to show the user. */
export class CaptureError extends Error {}

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function createVoiceCapture(
  tx: Tx,
  input: { tenantId: string; userId: string; audio: Buffer; mime: string; durationMs: number | null; contextContactId: string | null },
) {
  const [row] = await tx
    .insert(captures)
    .values({
      tenantId: input.tenantId,
      userId: input.userId,
      kind: "voice",
      status: "transcribing",
      audio: input.audio,
      audioMime: input.mime,
      durationMs: input.durationMs,
      contextContactId: input.contextContactId,
    })
    .returning({ id: captures.id });
  return row!.id;
}

function errorMessage(error: unknown) {
  if (error instanceof AiError) return error.message;
  console.error("Capture processing failed", error);
  return "Something went wrong while processing this note.";
}

async function knownPeople(tx: Tx): Promise<KnownPerson[]> {
  const rows = await tx
    .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, nickname: contacts.nickname })
    .from(contacts)
    .where(and(isNull(contacts.deletedAt), eq(contacts.isSelf, false)))
    .limit(1000);
  return rows.map((r) => ({ id: r.id, name: [r.firstName, r.lastName].filter(Boolean).join(" "), nickname: r.nickname }));
}

/**
 * Saves progress lines as the model streams, at most about once a second and only when they
 * change, so the review page has something to show without a write per token.
 */
function progressWriter(tenantId: string, captureId: string, toLines: (partial: PartialExtraction) => string[]) {
  let saved = "";
  let lastAt = 0;
  let writing: Promise<unknown> = Promise.resolve();
  let busy = false;
  return {
    update(partial: PartialExtraction) {
      if (busy || Date.now() - lastAt < 1000) return;
      const lines = toLines(partial);
      const key = JSON.stringify(lines);
      if (key === saved) return;
      saved = key;
      lastAt = Date.now();
      busy = true;
      writing = withTenant(db, tenantId, (tx) => tx.update(captures).set({ progress: lines }).where(eq(captures.id, captureId)))
        .catch((error) => console.error("Saving capture progress failed", error))
        .finally(() => (busy = false));
    },
    /** Wait for the last write so it can't land after the result. */
    settled: () => writing,
  };
}

/**
 * Transcribe (unless a transcript is supplied) and extract. Runs after the upload response
 * is sent; status changes are what the review page polls.
 */
export async function processCapture(tenantId: string, captureId: string, timeZone: string, transcript?: string) {
  try {
    let text = transcript;
    if (text === undefined) {
      const capture = await withTenant(db, tenantId, async (tx) => {
        const [row] = await tx.select().from(captures).where(eq(captures.id, captureId));
        return row;
      });
      if (!capture?.audio) throw new AiError("This capture has no audio.");
      const transcriber = await withTenant(db, tenantId, (tx) => transcriberForUser(tx, capture.userId));
      text = await transcriber.transcribe(capture.audio, capture.audioMime ?? "audio/webm");
    }
    if (!text.trim()) throw new AiError("No speech was detected in the recording.");

    const transcriptText = text;
    const context = await withTenant(db, tenantId, async (tx) => {
      const people = await knownPeople(tx);
      const firstLine = mentionLine(mentionedPeople(transcriptText, people));
      await tx
        .update(captures)
        .set({ status: "extracting", transcript: transcriptText, progress: [firstLine], error: null })
        .where(eq(captures.id, captureId));
      const [capture] = await tx.select().from(captures).where(eq(captures.id, captureId));
      return {
        firstLine,
        people,
        contextPerson: people.find((p) => p.id === capture?.contextContactId) ?? null,
        extractor: await extractorForUser(tx, capture!.userId),
      };
    });

    const today = toIsoDate(todayIn(timeZone));
    const progress = progressWriter(tenantId, captureId, (partial) => [
      context.firstLine,
      ...extractionProgress(partial, { knownPeople: context.people, today }),
    ]);
    const extraction = await context.extractor.extract(
      { transcript: text, today, timeZone, knownPeople: context.people, contextPerson: context.contextPerson },
      progress.update,
    );
    await progress.settled();

    await withTenant(db, tenantId, (tx) =>
      tx.update(captures).set({ status: "ready", extraction, progress: null }).where(eq(captures.id, captureId)),
    );
  } catch (error) {
    await withTenant(db, tenantId, (tx) =>
      tx
        .update(captures)
        .set({ status: "failed", progress: null, error: errorMessage(error) })
        .where(eq(captures.id, captureId)),
    );
  }
}

export async function getCapture(tx: Tx, captureId: string) {
  const [row] = await tx
    .select({
      id: captures.id,
      status: captures.status,
      transcript: captures.transcript,
      extraction: captures.extraction,
      progress: captures.progress,
      error: captures.error,
      contextContactId: captures.contextContactId,
      durationMs: captures.durationMs,
      createdAt: captures.createdAt,
      committedAt: captures.committedAt,
    })
    .from(captures)
    .where(eq(captures.id, captureId));
  if (!row) return null;
  const parsed = row.extraction ? extractionSchema.safeParse(row.extraction) : null;
  return { ...row, extraction: parsed?.success ? parsed.data : null };
}

/** What the user approved on the review screen. Only included items are sent. */
export const commitSchema = z.object({
  people: z.array(
    z.object({
      ref: z.string(),
      contactId: z.uuid().nullable(),
      firstName: z.string().trim().min(1).max(100),
      lastName: z.string().trim().max(100).nullable(),
      nickname: z.string().trim().max(100).nullable(),
      pronouns: z.string().trim().max(50).nullable(),
      birthday: partialDateSchema.nullable(),
      howMet: z.string().trim().max(2000).nullable(),
      facts: z.array(
        z.object({
          category: z.enum(factCategories),
          label: z.string().trim().min(1).max(100),
          value: z.string().trim().min(1).max(500),
        }),
      ),
      note: z.string().trim().max(5000).nullable(),
    }),
  ),
  interaction: z
    .object({
      type: z.enum(interactionTypes),
      date: z.iso.date(),
      location: z.string().trim().max(200).nullable(),
      summary: z.string().trim().min(1).max(2000),
      participantRefs: z.array(z.string()).min(1),
    })
    .nullable(),
});
export type CommitInput = z.infer<typeof commitSchema>;

/** Write an approved capture to people, facts, notes, interactions and timelines in one transaction. */
export async function commitCapture(tx: Tx, tenantId: string, captureId: string, input: CommitInput): Promise<string[]> {
  const [capture] = await tx
    .select({ status: captures.status, createdAt: captures.createdAt })
    .from(captures)
    .where(eq(captures.id, captureId))
    .for("update");
  if (!capture) throw new CaptureError("This voice note no longer exists.");
  if (capture.status !== "ready") throw new CaptureError("This voice note has already been handled.");

  const recordedAt = capture.createdAt;
  const timeline: TimelineInput[] = [];
  const contactIdByRef = new Map<string, string>();

  for (const person of input.people) {
    let contactId = person.contactId;
    if (contactId) {
      // Fill blanks on existing people; never overwrite what the user already entered.
      const [existing] = await tx.select().from(contacts).where(eq(contacts.id, contactId));
      if (!existing) throw new CaptureError("One of the people no longer exists.");
      await tx
        .update(contacts)
        .set({
          lastName: existing.lastName ?? person.lastName,
          nickname: existing.nickname ?? person.nickname,
          pronouns: existing.pronouns ?? person.pronouns,
          howMet: existing.howMet ?? person.howMet,
        })
        .where(eq(contacts.id, contactId));
    } else {
      const [created] = await tx
        .insert(contacts)
        .values({
          tenantId,
          firstName: person.firstName,
          lastName: person.lastName,
          nickname: person.nickname,
          pronouns: person.pronouns,
          howMet: person.howMet,
          closeness: "friend",
          keepInTouchDays: defaultCadenceDays.friend,
        })
        .returning({ id: contacts.id });
      contactId = created!.id;
      // A millisecond earlier so "Added" sorts below the voice note it came from.
      timeline.push({
        tenantId,
        contactId,
        kind: "created",
        occurredAt: new Date(recordedAt.getTime() - 1),
        title: "Added from a voice note",
        captureId,
      });
    }
    contactIdByRef.set(person.ref, contactId);

    const learned: string[] = [];
    if (person.birthday && isValidPartialDate(person.birthday)) {
      const [existingBirthday] = await tx
        .select({ id: importantDates.id })
        .from(importantDates)
        .where(and(eq(importantDates.contactId, contactId), eq(importantDates.type, "birthday")));
      const value = { year: person.birthday.year ?? null, month: person.birthday.month, day: person.birthday.day };
      if (existingBirthday) {
        await tx.update(importantDates).set(value).where(eq(importantDates.id, existingBirthday.id));
      } else {
        await tx.insert(importantDates).values({ tenantId, contactId, type: "birthday", ...value });
      }
      learned.push(`Birthday: ${formatPartialDate(person.birthday)}`);
    }

    // Skip facts the person already has, so repeating yourself doesn't create duplicates.
    const known = await tx
      .select({ category: facts.category, value: facts.value })
      .from(facts)
      .where(and(eq(facts.contactId, contactId), isNull(facts.archivedAt)));
    const key = (f: { category: string; value: string }) => `${f.category}|${f.value.trim().toLowerCase()}`;
    const knownKeys = new Set(known.map(key));
    const newFacts = person.facts.filter((f) => !knownKeys.has(key(f)));
    if (newFacts.length > 0) {
      await tx.insert(facts).values(newFacts.map((f) => ({ tenantId, contactId: contactId!, captureId, ...f })));
      learned.push(...newFacts.map((f) => `${f.label}: ${f.value}`));
    }

    let noteId: string | null = null;
    if (person.note) {
      const [note] = await tx
        .insert(notes)
        .values({ tenantId, contactId, body: person.note, captureId })
        .returning({ id: notes.id });
      noteId = note!.id;
    }

    if (person.note || learned.length > 0) {
      timeline.push({
        tenantId,
        contactId,
        kind: "voice",
        occurredAt: recordedAt,
        title: "Voice note",
        body: person.note,
        refId: noteId,
        captureId,
        data: { learned },
      });
    }
  }

  if (input.interaction) {
    const ix = input.interaction;
    const participantIds = ix.participantRefs.map((r) => contactIdByRef.get(r)).filter((id): id is string => !!id);
    if (participantIds.length > 0) {
      const occurredAt = dateToInstant(parseIsoDate(ix.date));
      const [row] = await tx
        .insert(interactions)
        .values({ tenantId, type: ix.type, occurredAt, location: ix.location, summary: ix.summary, captureId })
        .returning({ id: interactions.id });
      await tx.insert(interactionPeople).values(participantIds.map((contactId) => ({ tenantId, interactionId: row!.id, contactId })));
      await tx
        .update(contacts)
        .set({ lastInteractionAt: sql`greatest(${contacts.lastInteractionAt}, ${occurredAt.toISOString()}::timestamptz)` })
        .where(inArray(contacts.id, participantIds));
      await resolveCheckins(tx, participantIds);
      for (const contactId of participantIds) {
        timeline.push({
          tenantId,
          contactId,
          kind: "interaction",
          occurredAt,
          title: ix.type,
          body: ix.summary,
          refId: row!.id,
          captureId,
          data: { location: ix.location, with: participantIds.filter((id) => id !== contactId) },
        });
      }
    }
  }

  await recordTimeline(tx, timeline);
  // Audio isn't needed once the content is saved.
  await tx
    .update(captures)
    .set({ status: "committed", committedAt: new Date(), audio: null })
    .where(eq(captures.id, captureId));

  return [...new Set(contactIdByRef.values())];
}

export type { Extraction };
