"use server";

import { ContactInfoError, normalizeMethod } from "@life-crm/core";
import { schema } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addMethods } from "@/lib/data/contact-info";
import { insertContact } from "@/lib/data/contacts";
import { listPeople } from "@/lib/data/people";
import { recordTimeline } from "@/lib/data/timeline";
import { personName } from "@/lib/forms";
import { tenantQuery } from "@/lib/session";

export async function searchPeople(q: string) {
  const query = q.trim().slice(0, 100);
  if (!query) return [];
  const people = await listPeople({ q: query });
  return people.slice(0, 8).map((p) => ({
    id: p.id,
    name: [p.firstName, p.lastName].filter(Boolean).join(" "),
    avatarRef: p.avatarRef,
    hint: p.matched ?? p.relationship ?? null,
  }));
}

export interface QuickAddState {
  error?: string;
  id?: string;
}

/** Name plus whatever you know, in one go. The rest can be filled in on their profile. */
export async function quickAdd(_prev: QuickAddState, form: FormData): Promise<QuickAddState> {
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { error: "Add a name" };
  const [firstName, ...rest] = name.split(" ");
  for (const part of [firstName!, rest.join(" ")]) {
    const ok = personName(100).safeParse(part);
    if (!ok.success) return { error: ok.error.issues[0]?.message };
  }
  const note = z.string().trim().max(5000).parse(String(form.get("note") ?? ""));
  const phone = String(form.get("phone") ?? "").trim();
  if (phone) {
    try {
      normalizeMethod("phone", "mobile", phone);
    } catch (err) {
      if (err instanceof ContactInfoError) return { error: err.message };
      throw err;
    }
  }

  const id = await tenantQuery(async (tx, user) => {
    const id = await insertContact(tx, user.tenantId, { firstName: firstName!, lastName: rest.join(" ") || null, closeness: "friend" });
    if (phone) await addMethods(tx, user.tenantId, id, [{ kind: "phone", label: "mobile", value: phone }]);
    if (note) {
      const [n] = await tx
        .insert(schema.notes)
        .values({ tenantId: user.tenantId, contactId: id, body: note })
        .returning({ id: schema.notes.id, createdAt: schema.notes.createdAt });
      await recordTimeline(tx, [{ tenantId: user.tenantId, contactId: id, kind: "note", occurredAt: n!.createdAt, title: "Note", body: note, refId: n!.id }]);
    }
    return id;
  });
  revalidatePath("/people");
  revalidatePath("/dashboard");
  return { id };
}
