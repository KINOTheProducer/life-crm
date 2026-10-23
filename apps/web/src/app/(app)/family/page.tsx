import { closenessLabels, closenessTiers, kinshipGroup, layoutHourglass, partnersOf } from "@life-crm/core";
import Link from "next/link";
import { FamilyTree, type TreeCard } from "@/components/family/tree";
import { PlaceFromLabels } from "@/components/family/place-from-labels";
import { Avatar } from "@/components/avatar";
import { PageHeader } from "@/components/page-header";
import { fullName } from "@/lib/data/contacts";
import { birthOrder, ensureSelf, loadConnections, loadFamily, treeContacts, type TreePerson } from "@/lib/data/family";
import { immichConnection } from "@/lib/immich";
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
    return {
      family: await loadFamily(tx, selfId),
      contacts: await treeContacts(tx),
      links: await loadConnections(tx),
      immich: Boolean(await immichConnection(tx, user.id)),
    };
  });
  const placeable = await placeableFromLabels();
  const { family, links } = data;
  const byId = new Map(data.contacts.map((c) => [c.id, c]));
  const focusId = typeof focus === "string" && byId.has(focus) ? focus : family.selfId;
  const layout = layoutHourglass(family.index, focusId, { up: 3, down: 3, order: birthOrder(family.people) });

  const liveLinks = (id: string) => (links.get(id) ?? []).filter((l) => byId.has(l));
  // Anyone outside the family with no friend link is a friend of yours.
  const unplaced = data.contacts.filter((c) => !c.isSelf && !family.relatives.has(c.id) && liveLinks(c.id).length === 0).map((c) => c.id);
  const friendsOf = (id: string) => [...liveLinks(id), ...(id === family.selfId ? unplaced : [])];
  const lane = friendsOf(focusId);

  const cards: Record<string, TreeCard> = {};
  const addCard = (id: string) => {
    const c = byId.get(id);
    if (!c || cards[id]) return;
    const p = family.people.get(id);
    const partners = partnersOf(family.index, id).flatMap((pp) => {
      const q = family.people.get(pp.id);
      return q ? [{ id: q.id, name: q.name }] : [];
    });
    const soloKids = (family.index.ownFamilies.get(id) ?? []).some((f) => f.partners.length === 1 && f.children.length > 0);
    const term = p ? family.termFor(id) : null;
    const friendLinks = liveLinks(id).map((l) => ({ id: l, firstName: byId.get(l)!.firstName }));
    cards[id] = {
      id,
      name: fullName(c),
      firstName: c.firstName,
      lastName: c.lastName,
      nickname: c.nickname,
      pronouns: c.pronouns,
      closeness: c.closeness,
      keepInTouchDays: c.keepInTouchDays,
      avatarRef: c.avatarRef,
      term: term && term !== "you" ? capitalize(term) : friendLinks.length ? `${friendLinks.map((f) => `${f.firstName}'s`).join(" and ")} friend` : closenessLabels[c.closeness],
      years: p ? years(p) : null,
      isSelf: c.isSelf,
      isDeceased: c.isDeceased || p?.deathYear != null,
      partners,
      hasSoloChildren: soloKids,
      friendLinks,
      friendCount: friendsOf(id).length,
    };
  };
  layout.nodes.forEach((n) => addCard(n.id));
  lane.forEach(addCard);
  const laneGroups =
    focusId === family.selfId
      ? closenessTiers.map((t) => ({ label: closenessLabels[t], ids: lane.filter((id) => byId.get(id)!.closeness === t) })).filter((g) => g.ids.length)
      : [{ label: "Friends", ids: lane }].filter((g) => g.ids.length);
  const people = data.contacts.filter((c) => !c.isSelf).map((c) => ({ id: c.id, name: fullName(c) }));
  const relativeCount = family.relatives.size - 1;
  const onlyYou = relativeCount === 0;
  const focusName = focusId === family.selfId ? null : cards[focusId]?.name;

  // Everyone in the tree, grouped by how they're related to you.
  const groups = new Map<string, { person: TreePerson; term: string }[]>();
  for (const p of family.people.values()) {
    if (p.isSelf || !family.relatives.has(p.id)) continue;
    const term = family.termFor(p.id) ?? "related";
    const g = term === "related" ? "Others" : kinshipGroup(term);
    groups.set(g, [...(groups.get(g) ?? []), { person: p, term }]);
  }
  const tab = (active: boolean) => cn("rounded-full px-3.5 py-2 text-sm", active ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary");

  return (
    <>
      <PageHeader
        title="Family."
        aside={focusName ? `Around ${focusName}.` : `${relativeCount || "No"} ${relativeCount === 1 ? "relative" : "relatives"} so far.`}
        description={onlyYou ? "Start with your parents, partner, siblings or kids. Tap yourself in the tree to add someone." : undefined}
        actions={
          <div className="flex gap-1">
            <Link href={focusId !== family.selfId ? `/family?focus=${focusId}` : "/family"} className={tab(!everyone)}>
              Tree
            </Link>
            <Link href="/family?view=everyone" className={tab(everyone)}>
              Everyone
            </Link>
            <Link href="/family/import" className={tab(false)}>
              Import / export
            </Link>
          </div>
        }
      />

      {placeable.length > 0 && <PlaceFromLabels people={placeable} />}

      {everyone ? (
        <div className="grid gap-4">
          {groups.size === 0 && <p className="rounded-3xl bg-card p-6 md:p-8 text-muted-foreground">No one in your tree yet.</p>}
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
        <FamilyTree key={focusId} layout={layout} cards={cards} focusId={focusId} people={people} lane={laneGroups} immich={data.immich} />
      )}
    </>
  );
}
