"use server";

import { contactInputSchema } from "@life-crm/core";
import { redirect } from "next/navigation";
import { insertContact } from "@/lib/data/contacts";
import { dateProblemText, partialDateFrom, personName } from "@/lib/forms";
import { tenantQuery } from "@/lib/session";

export interface CreatePersonState {
  error?: string;
}

export async function createPerson(_prev: CreatePersonState, form: FormData): Promise<CreatePersonState> {
  for (const field of ["firstName", "lastName", "nickname"]) {
    const name = personName(100).safeParse(form.get(field) ?? "");
    if (!name.success) return { error: name.error.issues[0]?.message };
  }
  const birthday = partialDateFrom(form, "birthday");
  if (typeof birthday === "string") return { error: dateProblemText("Birthday", birthday) };
  const parsed = contactInputSchema.safeParse({
    firstName: form.get("firstName"),
    lastName: form.get("lastName"),
    nickname: form.get("nickname"),
    pronouns: form.get("pronouns"),
    closeness: form.get("closeness") || undefined,
    howMet: form.get("howMet"),
    birthday,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const contactId = await tenantQuery((tx, user) => insertContact(tx, user.tenantId, parsed.data));
  redirect(`/people/${contactId}`);
}
