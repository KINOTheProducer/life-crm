"use server";

import { contactInputSchema, defaultCadenceDays } from "@life-crm/core";
import { schema } from "@life-crm/db";
import { redirect } from "next/navigation";
import { tenantQuery } from "@/lib/session";

export interface CreatePersonState {
  error?: string;
}

function intOrNull(value: FormDataEntryValue | null): number | null {
  const s = String(value ?? "").trim();
  return s === "" ? null : Number(s);
}

export async function createPerson(_prev: CreatePersonState, form: FormData): Promise<CreatePersonState> {
  const month = intOrNull(form.get("birthdayMonth"));
  const day = intOrNull(form.get("birthdayDay"));
  const parsed = contactInputSchema.safeParse({
    firstName: form.get("firstName"),
    lastName: form.get("lastName"),
    nickname: form.get("nickname"),
    pronouns: form.get("pronouns"),
    closeness: form.get("closeness") || undefined,
    howMet: form.get("howMet"),
    birthday: month && day ? { month, day, year: intOrNull(form.get("birthdayYear")) } : null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { birthday, ...input } = parsed.data;
  await tenantQuery(async (tx, user) => {
    const [contact] = await tx
      .insert(schema.contacts)
      .values({ ...input, tenantId: user.tenantId, keepInTouchDays: defaultCadenceDays[input.closeness] })
      .returning({ id: schema.contacts.id });
    if (birthday) {
      await tx.insert(schema.importantDates).values({
        tenantId: user.tenantId,
        contactId: contact!.id,
        type: "birthday",
        year: birthday.year ?? null,
        month: birthday.month,
        day: birthday.day,
      });
    }
  });
  redirect("/people");
}
