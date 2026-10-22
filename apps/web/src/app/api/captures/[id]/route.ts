import { withTenant } from "@life-crm/db";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getCapture } from "@/lib/data/capture";
import { db } from "@/lib/db";

/** Processing status and what's been found so far, polled by the review page. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/captures/[id]">) {
  const session = await auth.api.getSession({ headers: request.headers });
  const tenantId = session?.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const capture = await withTenant(db, tenantId, (tx) => getCapture(tx, id));
  if (!capture) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ status: capture.status, progress: capture.progress ?? [], error: capture.error });
}
