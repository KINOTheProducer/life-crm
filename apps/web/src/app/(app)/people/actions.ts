"use server";

import { contactInputSchema } from "@life-crm/core";
import { redirect } from "next/navigation";
import { insertContact } from "@/lib/data/contacts";
import { intOrNull } from "@/lib/forms";
import { tenantQuery } from "@/lib/session";

export interface CreatePersonState {
  error?: string;
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

  const contactId = await tenantQuery((tx, user) => insertContact(tx, user.tenantId, parsed.data));
  redirect(`/people/${contactId}`);
}
