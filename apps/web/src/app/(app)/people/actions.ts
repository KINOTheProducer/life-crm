"use server";

import { ContactInfoError, contactInputSchema, normalizeMethod } from "@life-crm/core";
import { redirect } from "next/navigation";
import { addMethods } from "@/lib/data/contact-info";
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

  const methods = [
    { kind: "phone" as const, label: "mobile", value: String(form.get("phone") ?? "").trim() },
    { kind: "email" as const, label: "personal", value: String(form.get("email") ?? "").trim() },
  ].filter((m) => m.value);
  for (const m of methods) {
    try {
      normalizeMethod(m.kind, m.label, m.value);
    } catch (err) {
      if (err instanceof ContactInfoError) return { error: err.message };
      throw err;
    }
  }

  const contactId = await tenantQuery(async (tx, user) => {
    const id = await insertContact(tx, user.tenantId, parsed.data);
    await addMethods(tx, user.tenantId, id, methods);
    return id;
  });
  redirect(`/people/${contactId}`);
}
