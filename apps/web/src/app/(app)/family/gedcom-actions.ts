"use server";

import { parseGedcom, type GedTree } from "@life-crm/core";
import { revalidatePath } from "next/cache";
import { GEDCOM_MAX_PEOPLE, importGedcom, previewGedcom, type GedcomPreview } from "@/lib/data/gedcom";
import { tenantQuery } from "@/lib/session";

export type PreviewResult = { error: string } | GedcomPreview;
export type ImportResult = { error: string } | { created: number; linked: number; families: number };

function read(text: string): { error: string } | { tree: GedTree } {
  if (typeof text !== "string" || text.length === 0) return { error: "That file is empty" };
  if (!/^\uFEFF?\s*0 HEAD/.test(text.slice(0, 200))) return { error: "That doesn't look like a GEDCOM file (.ged)" };
  const tree = parseGedcom(text);
  if (tree.people.length === 0) return { error: "No people found in that file" };
  return { tree };
}

export async function previewGedcomFile(text: string): Promise<PreviewResult> {
  const parsed = read(text);
  if ("error" in parsed) return parsed;
  return tenantQuery((tx, user) => previewGedcom(tx, user, parsed.tree));
}

export async function importGedcomFile(text: string, selfXref: string | null): Promise<ImportResult> {
  const parsed = read(text);
  if ("error" in parsed) return parsed;
  if (parsed.tree.people.length > GEDCOM_MAX_PEOPLE) return { error: `That tree has more than ${GEDCOM_MAX_PEOPLE.toLocaleString()} people, too many to bring in at once` };
  const self = selfXref && parsed.tree.people.some((p) => p.xref === selfXref) ? selfXref : null;
  const result = await tenantQuery((tx, user) => importGedcom(tx, user, parsed.tree, self));
  revalidatePath("/family");
  revalidatePath("/people");
  return result;
}
