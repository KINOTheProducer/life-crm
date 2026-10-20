"use server";

import { and, eq, schema } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { newDavPassword } from "@/lib/dav/passwords";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

const { davPasswords } = schema;
const MAX_PASSWORDS = 20;

/** Make an app password for a contacts app. It's returned once; only its hash is kept. */
export async function createDavPassword(name: string): Promise<{ password?: string; error?: string }> {
  const me = await requireUser();
  const label = z.string().trim().min(1).max(60).safeParse(name);
  if (!label.success) return { error: "Name it after the device, like iPhone." };
  const existing = await db.select({ id: davPasswords.id }).from(davPasswords).where(eq(davPasswords.userId, me.id));
  if (existing.length >= MAX_PASSWORDS) return { error: `You have ${MAX_PASSWORDS} already. Remove one you don't use.` };
  const { password, hash } = newDavPassword();
  await db.insert(davPasswords).values({ userId: me.id, name: label.data, tokenHash: hash });
  revalidatePath("/settings");
  return { password };
}

export async function revokeDavPassword(id: string) {
  const me = await requireUser();
  if (!z.uuid().safeParse(id).success) return;
  await db.delete(davPasswords).where(and(eq(davPasswords.id, id), eq(davPasswords.userId, me.id)));
  revalidatePath("/settings");
}
