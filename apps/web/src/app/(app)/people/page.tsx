import { Plus } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { listPeople } from "@/lib/data/people";

export default async function PeoplePage() {
  const people = await listPeople();

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">People</h1>
        <Link href="/people/new" className={buttonVariants()}>
          <Plus />
          Add person
        </Link>
      </div>
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one here yet. Add the first person in your life.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {people.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="font-medium">{[p.firstName, p.lastName].filter(Boolean).join(" ")}</span>
                {p.nickname && <span className="ml-2 text-sm text-muted-foreground">“{p.nickname}”</span>}
              </div>
              <Badge variant="secondary">{p.closeness === "inner" ? "Inner circle" : p.closeness}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
