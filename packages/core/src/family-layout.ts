import { childrenOf, parentsOf, partnersOf, siblingsOf, type FamilyIndex } from "./kinship";

/**
 * Hourglass layout around one person: their ancestors above, their siblings (and everyone's
 * partners) beside them, their descendants below. Positions are in slots (one card wide) and
 * generations (0 = the focus row, negative = up), so the UI picks the pixel sizes.
 */

export interface LaidOutNode {
  id: string;
  /** Centre, in slots from the left edge. */
  x: number;
  gen: number;
}

export interface CoupleLine {
  gen: number;
  x1: number;
  x2: number;
}

export interface DescentLine {
  /** The parents' generation; children are one below. */
  gen: number;
  fromX: number;
  /** True when the line starts between two partners rather than under one parent. */
  fromCouple: boolean;
  childXs: number[];
}

export interface HourglassLayout {
  nodes: LaidOutNode[];
  couples: CoupleLine[];
  descents: DescentLine[];
  width: number;
  minGen: number;
  maxGen: number;
}

interface Block {
  width: number;
  place: (left: number, gen: number) => void;
}

export function layoutHourglass(
  index: FamilyIndex,
  focus: string,
  options: { up?: number; down?: number; order?: (a: string, b: string) => number } = {},
): HourglassLayout {
  const { up = 3, down = 3, order = () => 0 } = options;
  const positions = new Map<string, LaidOutNode>();
  const claimed = new Set<string>();
  /** Each person appears once, even when the family loops back (cousins marrying, pedigree collapse). */
  const claim = (id: string) => {
    if (claimed.has(id)) return false;
    claimed.add(id);
    return true;
  };
  const put = (id: string, x: number, gen: number) => positions.set(id, { id, x, gen });

  /** A person with their partners beside them, and (to `depth`) their children below. */
  function descendants(id: string, depth: number): Block {
    const group = [id, ...partnersOf(index, id).map((p) => p.id).filter(claim)];
    const kids = depth > 0 ? childrenOf(index, id, true).filter(claim).sort(order) : [];
    const kidBlocks = kids.map((k) => descendants(k, depth - 1));
    const kidsWidth = kidBlocks.reduce((n, b) => n + b.width, 0);
    const width = Math.max(group.length, kidsWidth);
    return {
      width,
      place(left, gen) {
        const start = left + (width - group.length) / 2;
        group.forEach((g, i) => put(g, start + i + 0.5, gen));
        let x = left + (width - kidsWidth) / 2;
        for (const b of kidBlocks) {
          b.place(x, gen + 1);
          x += b.width;
        }
      },
    };
  }

  /** A person with their ancestors stacked above them, pedigree style. */
  function ancestry(id: string, depth: number): Block {
    const parents = depth > 0 ? parentsOf(index, id, true).filter(claim) : [];
    const blocks = parents.map((p) => ancestry(p, depth - 1));
    const parentsWidth = blocks.reduce((n, b) => n + b.width, 0);
    const width = Math.max(1, parentsWidth);
    return {
      width,
      place(left, gen) {
        put(id, left + width / 2, gen);
        let x = left + (width - parentsWidth) / 2;
        for (const b of blocks) {
          b.place(x, gen - 1);
          x += b.width;
        }
      },
    };
  }

  // The focus row: siblings in birth order with the focus among them, each with partners.
  claim(focus);
  const siblings = siblingsOf(index, focus).map((s) => s.id);
  siblings.forEach(claim);
  const row = [focus, ...siblings].sort(order);
  const parents = up > 0 ? parentsOf(index, focus, true) : [];
  parents.forEach(claim);
  const rowBlocks = row.map((id) => (id === focus ? descendants(id, down) : descendants(id, 0)));
  const parentBlocks = parents.map((p) => ancestry(p, up - 1));

  let x = 0;
  rowBlocks.forEach((b) => {
    b.place(x, 0);
    x += b.width;
  });
  const rowWidth = x;
  const parentsWidth = parentBlocks.reduce((n, b) => n + b.width, 0);
  // Centre the parents over the children they share with the focus.
  const shared = [focus, ...siblings.filter((s) => parents.some((p) => childrenOf(index, p, true).includes(s)))];
  const sharedXs = shared.map((s) => positions.get(s)!.x);
  const centre = sharedXs.length ? (Math.min(...sharedXs) + Math.max(...sharedXs)) / 2 : rowWidth / 2;
  x = centre - parentsWidth / 2;
  parentBlocks.forEach((b) => {
    b.place(x, -1);
    x += b.width;
  });

  // Normalise so the leftmost card starts at 0.
  const nodes = [...positions.values()];
  const minX = Math.min(...nodes.map((n) => n.x - 0.5));
  for (const n of nodes) n.x -= minX;

  const couples: CoupleLine[] = [];
  const descents: DescentLine[] = [];
  for (const f of index.families.values()) {
    const shownPartners = f.partners.map((p) => positions.get(p)).filter((n): n is LaidOutNode => !!n);
    if (shownPartners.length === 2 && shownPartners[0]!.gen === shownPartners[1]!.gen) {
      const [a, b] = shownPartners.sort((p, q) => p.x - q.x);
      couples.push({ gen: a!.gen, x1: a!.x, x2: b!.x });
    }
    if (shownPartners.length === 0) continue;
    const gen = shownPartners[0]!.gen;
    const kids = f.children.map((c) => positions.get(c.id)).filter((n): n is LaidOutNode => !!n && n.gen === gen + 1);
    if (kids.length === 0) continue;
    const sameRow = shownPartners.filter((p) => p.gen === gen);
    const fromX = sameRow.length === 2 ? (sameRow[0]!.x + sameRow[1]!.x) / 2 : sameRow[0]!.x;
    descents.push({ gen, fromX, fromCouple: sameRow.length === 2, childXs: kids.map((k) => k.x).sort((a, b) => a - b) });
  }

  const gens = nodes.map((n) => n.gen);
  return {
    nodes,
    couples,
    descents,
    width: Math.max(...nodes.map((n) => n.x + 0.5)),
    minGen: Math.min(...gens),
    maxGen: Math.max(...gens),
  };
}
