"use server";

import { and, eq, isNotNull, schema } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { tenantQuery } from "@/lib/session";

const { contacts } = schema;
const uuid = z.uuid();

function refresh(contactId: string) {
  revalidatePath("/people");
  revalidatePath("/people/trash");
  revalidatePath("/dashboard");
  revalidatePath("/family");
  revalidatePath(`/people/${contactId}`);
}

/** Move someone to the trash. They can be restored for 30 days. */
export async function trashPerson(contactId: string) {
  if (!uuid.safeParse(contactId).success) return;
  await tenantQuery((tx) =>
    tx
      .update(contacts)
      .set({ deletedAt: new Date() })
      .where(and(eq(contacts.id, contactId), eq(contacts.isSelf, false))),
  );
  refresh(contactId);
  redirect("/people/trash");
}

export async function restorePerson(contactId: string) {
  if (!uuid.safeParse(contactId).success) return;
  await tenantQuery((tx) => tx.update(contacts).set({ deletedAt: null }).where(eq(contacts.id, contactId)));
  refresh(contactId);
}

/** Gone for good, with everything about them. Only from the trash. */
export async function deleteForever(contactId: string) {
  if (!uuid.safeParse(contactId).success) return;
  await tenantQuery((tx) => tx.delete(contacts).where(and(eq(contacts.id, contactId), isNotNull(contacts.deletedAt))));
  refresh(contactId);
}
