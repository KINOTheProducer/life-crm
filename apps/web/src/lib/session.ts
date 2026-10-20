import "server-only";
import { withTenant, type Tx } from "@life-crm/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./db";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  tenantId: string;
  timeZone: string;
}

/** The signed-in user, or a redirect to sign-in. */
export async function requireUser(): Promise<CurrentUser> {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user?.tenantId) redirect("/sign-in");
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    tenantId: user.tenantId,
    timeZone: user.timeZone ?? "America/Toronto",
  };
}

/** Run a query as the signed-in user's tenant. */
export async function tenantQuery<T>(fn: (tx: Tx, user: CurrentUser) => Promise<T>): Promise<T> {
  const user = await requireUser();
  return withTenant(db, user.tenantId, (tx) => fn(tx, user));
}
