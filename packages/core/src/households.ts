// Naming a household for an envelope or a list.

export interface HouseholdMember {
  firstName: string;
  lastName: string | null;
  /** Kids are on the card but not in the name: "Ryan & Mia Park" rather than "Ryan, Mia & Leo Park". */
  isChild?: boolean;
}

const join = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`);

/**
 * The name a holiday card goes to. Two adults sharing a last name: "Ryan & Mia Park". Different
 * last names: "Ryan Park & Mia Chen". More than two adults with one shared name: "The Park family".
 * Kids only make it "The Park family" when there's one surname.
 */
export function householdLabel(members: HouseholdMember[]): string {
  if (members.length === 0) return "";
  const adults = members.filter((m) => !m.isChild);
  const named = adults.length ? adults : members;
  const surnames = [...new Set(members.map((m) => m.lastName?.trim()).filter((s): s is string => !!s))];
  const shared = surnames.length === 1 ? surnames[0]! : null;
  if (shared && (named.length > 2 || (named.length < members.length && named.length !== 2))) return `The ${shared} family`;
  if (named.length === 1) return [named[0]!.firstName, named[0]!.lastName].filter(Boolean).join(" ");
  if (shared && named.every((m) => !m.lastName || m.lastName.trim() === shared)) return `${join(named.map((m) => m.firstName))} ${shared}`;
  return join(named.map((m) => [m.firstName, m.lastName].filter(Boolean).join(" ")));
}

/** Two addresses are the same place if street and city match, ignoring case, spacing and punctuation. */
export function addressKey(a: { street: string | null; city: string | null }): string | null {
  const norm = (s: string | null) =>
    (s ?? "")
      .toLowerCase()
      .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|court|ct|crescent|cres|lane|ln|place|pl)\b\.?/g, (w) => w.slice(0, 2))
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const street = norm(a.street);
  return street ? `${street}|${norm(a.city)}` : null;
}
