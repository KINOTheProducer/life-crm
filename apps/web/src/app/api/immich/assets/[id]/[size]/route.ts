import { ImmichError } from "@life-crm/immich";
import { withTenant } from "@life-crm/db";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { immichFor } from "@/lib/immich";

/** Proxies an Immich thumbnail or preview so the browser never sees the Immich URL or key. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/immich/assets/[id]/[size]">) {
  const session = await auth.api.getSession({ headers: request.headers });
  const tenantId = session?.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id, size } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || (size !== "thumbnail" && size !== "preview")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const immich = await withTenant(db, tenantId, (tx) => immichFor(tx, session.user.id));
  if (!immich) return NextResponse.json({ error: "Immich isn't connected" }, { status: 404 });

  try {
    const res = await immich.thumbnail(id, size);
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return NextResponse.json({ error: "Not an image" }, { status: 502 });
    return new Response(res.body, {
      headers: {
        "content-type": type,
        // Asset thumbnails don't change; keep them in the browser, never in shared caches.
        "cache-control": "private, max-age=86400, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    const status = err instanceof ImmichError && err.status === 404 ? 404 : 502;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Immich error" }, { status });
  }
}
