import Link from "next/link";
import { FaceMatcher } from "@/components/faces/face-matcher";
import { PageHeader } from "@/components/page-header";
import { immichConnection } from "@/lib/immich";
import { tenantQuery } from "@/lib/session";

export default async function FacesPage() {
  const connected = await tenantQuery((tx, user) => immichConnection(tx, user.id));
  return (
    <>
      <PageHeader
        title="Faces."
        aside="Who's who in your photos."
        description="Match the faces Immich found to your people. Names that match are filled in for you; check them and link."
      />
      {connected ? (
        <FaceMatcher />
      ) : (
        <p className="rounded-3xl bg-card p-8 text-muted-foreground">
          <Link href="/settings" className="underline underline-offset-4">
            Connect Immich
          </Link>{" "}
          first.
        </p>
      )}
    </>
  );
}
