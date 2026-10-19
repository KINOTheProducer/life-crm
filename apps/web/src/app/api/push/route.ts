import { and, eq, schema, withTenant } from "@life-crm/db";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const subscriptionSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

async function currentUser(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user.tenantId ? { id: session.user.id, tenantId: session.user.tenantId } : null;
}

/** Save this browser's push subscription. */
export async function POST(request: NextRequest) {
  const me = await currentUser(request);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });

  const { endpoint, keys } = parsed.data;
  await withTenant(db, me.tenantId, (tx) =>
    tx
      .insert(schema.pushSubscriptions)
      .values({ tenantId: me.tenantId, userId: me.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: request.headers.get("user-agent") })
      .onConflictDoUpdate({
        target: schema.pushSubscriptions.endpoint,
        set: { userId: me.id, p256dh: keys.p256dh, auth: keys.auth },
      }),
  );
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const me = await currentUser(request);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = z.object({ endpoint: z.string() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  await withTenant(db, me.tenantId, (tx) =>
    tx
      .delete(schema.pushSubscriptions)
      .where(and(eq(schema.pushSubscriptions.endpoint, body.data.endpoint), eq(schema.pushSubscriptions.userId, me.id))),
  );
  return NextResponse.json({ ok: true });
}
