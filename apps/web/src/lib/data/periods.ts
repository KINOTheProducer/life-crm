import "server-only";
import type { Period } from "@life-crm/core";
import { asc, eq, inArray, schema, type Tx } from "@life-crm/db";

const { contactPeriods } = schema;

const fields = {
  startYear: contactPeriods.startYear,
  startMonth: contactPeriods.startMonth,
  endYear: contactPeriods.endYear,
  endMonth: contactPeriods.endMonth,
};
const columns = { contactId: contactPeriods.contactId, ...fields };

/** Someone's periods, earliest first. */
export async function periodsOf(tx: Tx, contactId: string): Promise<Period[]> {
  return tx.select(fields).from(contactPeriods).where(eq(contactPeriods.contactId, contactId)).orderBy(asc(contactPeriods.startYear), asc(contactPeriods.startMonth));
}

/** Periods for many people at once, by contact id. Everyone's when `contactIds` is left out. */
export async function periodsByContact(tx: Tx, contactIds?: string[]): Promise<Map<string, Period[]>> {
  const rows = await tx
    .select(columns)
    .from(contactPeriods)
    .where(contactIds ? inArray(contactPeriods.contactId, contactIds) : undefined);
  const out = new Map<string, Period[]>();
  for (const { contactId, ...p } of rows) out.set(contactId, [...(out.get(contactId) ?? []), p]);
  return out;
}

/** Replace someone's periods. Validate first. */
export async function setPeriods(tx: Tx, tenantId: string, contactId: string, periods: Period[]) {
  await tx.delete(contactPeriods).where(eq(contactPeriods.contactId, contactId));
  if (periods.length) await tx.insert(contactPeriods).values(periods.map((p) => ({ tenantId, contactId, ...p })));
}
