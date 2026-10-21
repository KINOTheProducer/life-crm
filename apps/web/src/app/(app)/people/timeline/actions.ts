"use server";

import { eraKinds } from "@life-crm/core";
import { eq, schema } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/app/(app)/people/[id]/actions";
import { tenantQuery } from "@/lib/session";

const { eras } = schema;

const year = z.coerce.number().int("Use a whole year").min(1900, "That's before 1900").max(2100, "That's too far ahead");

const eraSchema = z
  .object({
    label: z.string().trim().min(1, "Name it, e.g. Waterloo or Shopify").max(80),
    kind: z.enum(eraKinds).catch("other"),
    startYear: year,
    endYear: z.union([z.literal("").transform(() => null), year]),
  })
  .refine((e) => e.endYear == null || e.endYear >= e.startYear, "It can't end before it starts");

export async function addEra(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = eraSchema.safeParse({
    label: form.get("label") ?? "",
    kind: form.get("kind"),
    startYear: form.get("startYear") ?? "",
    endYear: String(form.get("endYear") ?? "").trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  await tenantQuery((tx, user) => tx.insert(eras).values({ tenantId: user.tenantId, ...parsed.data }));
  revalidatePath("/people/timeline");
  return { ok: Date.now() };
}

export async function deleteEra(id: string) {
  if (!z.uuid().safeParse(id).success) return;
  await tenantQuery((tx) => tx.delete(eras).where(eq(eras.id, id)));
  revalidatePath("/people/timeline");
}
