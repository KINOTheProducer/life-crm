import { kinshipGroup, layoutHourglass, partnersOf } from "@life-crm/core";
import Link from "next/link";
import { FamilyTree, type TreeCard } from "@/components/family/tree";
import { PlaceFromLabels } from "@/components/family/place-from-labels";
import { Avatar } from "@/components/avatar";
import { PageHeader } from "@/components/page-header";
import { contactOptions } from "@/lib/data/contacts";
import { birthOrder, ensureSelf, loadFamily, type TreePerson } from "@/lib/data/family";
import { avatarSrc } from "@/lib/immich-urls";
import { tenantQuery } from "@/lib/session";
import { cn } from "@/lib/utils";
import { placeableFromLabels } from "./actions";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function years(p: TreePerson) {
  const born = p.birth?.year;
  if (p.isDeceased || p.deathYear) return born || p.deathYear ? `${born ?? "?"}–${p.deathYear ?? "?"}` : "In memory";
  return born ? `b. ${born}` : null;
}

const groupOrder = [
  "Partners",
  "Parents & grandparents",
  "Siblings",
  "Children & grandchildren",
  "Aunts, uncles, nieces & nephews",
  "Cousins",
  "In-laws & by marriage",
  "Step & foster family",
  "Others",
];

export default async function FamilyPage({ searchParams }: PageProps<"/family">) {
  const { focus, view } = await searchParams;
  const everyone = view === "everyone";
  const data = await tenantQuery(async (tx, user) => {
    const selfId = await ensureSelf(tx, user);
    return { family: await loadFamily(tx, selfId), people: (await contactOptions(tx)).map(({ id, name }) => ({ id, name })) };
  });
  const placeable = await placeableFromLabels();
  const { family } = data;
  const focusId = typeof focus === "string" && family.people.has(focus) ? focus : family.selfId;
  const layout = layoutHourglass(family.index, focusId, { up: 3, down: 3, order: birthOrder(family.people) });

  const cards: Record<string, TreeCard> = {};
  for (const n of layout.nodes) {
    const p = family.people.get(n.id);
    if (!p) continue;
    const partners = partnersOf(family.index, p.id).flatMap((pp) => {
      const q = family.people.get(pp.id);
      return q ? [{ id: q.id, name: q.name }] : [];
    });
    const soloKids = (family.index.ownFamilies.get(p.id) ?? []).some((f) => f.partners.length === 1 && f.children.length > 0);
    const term = family.termFor(p.id);
    cards[p.id] = {
      id: p.id,
      name: p.name,
      firstName: p.firstName,
      avatarRef: p.avatarRef,
      term: term ? capitalize(term) : null,
      years: years(p),
      isSelf: p.isSelf,
      isDeceased: p.isDeceased || p.deathYear != null,
      partners,
      hasSoloChildren: soloKids,
    };
  }
  const onlyYou = family.people.size <= 1;
  const focusName = focusId === family.selfId ? null : family.people.get(focusId)?.name;

  // Everyone in the tree, grouped by how they're related to you.
  const groups = new Map<string, { person: TreePerson; term: string }[]>();
  for (const p of family.people.values()) {
    if (p.isSelf) continue;
    const term = family.termFor(p.id) ?? "related";
    const g = term === "related" ? "Others" : kinshipGroup(term);
    groups.set(g, [...(groups.get(g) ?? []), { person: p, term }]);
  }
  const tab = (active: boolean) => cn("rounded-full px-3.5 py-2 text-sm", active ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary");

  return (
    <>
      <PageHeader
        title="Family."
        aside={focusName ? `Around ${focusName}.` : `${family.people.size - 1 || "No"} ${family.people.size - 1 === 1 ? "relative" : "relatives"} so far.`}
        description={onlyYou ? "Start with your parents, partner, siblings or kids. Click yourself in the tree to add someone." : undefined}
        actions={
          <div className="flex gap-1">
            <Link href={focusId !== family.selfId ? `/family?focus=${focusId}` : "/family"} className={tab(!everyone)}>
              Tree
            </Link>
            <Link href="/family?view=everyone" className={tab(everyone)}>
              Everyone
            </Link>
          </div>
        }
      />

      {placeable.length > 0 && <PlaceFromLabels people={placeable} />}

      {everyone ? (
        <div className="grid gap-4">
          {groups.size === 0 && <p className="rounded-3xl bg-card p-8 text-muted-foreground">No one in your tree yet.</p>}
          {groupOrder
            .filter((g) => groups.has(g))
            .map((g) => (
              <section key={g} className="rounded-3xl bg-card px-6 py-4">
                <h2 className="text-sm text-muted-foreground">{g}</h2>
                <ul className="divide-y divide-border">
                  {groups
                    .get(g)!
                    .sort((a, b) => birthOrder(family.people)(a.person.id, b.person.id))
                    .map(({ person: p, term }) => (
                      <li key={p.id} className="flex items-center gap-3 py-3">
                        <Avatar id={p.id} name={p.name} src={avatarSrc(p.avatarRef)} size={36} className={cn((p.isDeceased || p.deathYear) && "grayscale")} />
                        <Link href={`/people/${p.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                          {p.name}
                        </Link>
                        <span className="text-sm text-muted-foreground">{capitalize(term)}</span>
                        <span className="w-24 text-right font-mono text-xs text-muted-foreground">{years(p) ?? ""}</span>
                        <Link href={`/family?focus=${p.id}`} className="text-sm text-muted-foreground hover:text-foreground">
                          In tree
                        </Link>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
        </div>
      ) : (
        <FamilyTree key={focusId} layout={layout} cards={cards} focusId={focusId} people={data.people} />
      )}
    </>
  );
}
