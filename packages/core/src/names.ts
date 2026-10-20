const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * How well a name from elsewhere (an Immich face, an import) matches a person: 2 for the
 * full name or nickname, 1 for the first name alone, 0 for no match. Empty names never match.
 */
export function nameMatch(other: string, person: { firstName: string; lastName?: string | null; nickname?: string | null }): 0 | 1 | 2 {
  const n = normalize(other);
  if (!n) return 0;
  const full = normalize([person.firstName, person.lastName].filter(Boolean).join(" "));
  if (n === full || (person.nickname && n === normalize(person.nickname))) return 2;
  const first = normalize(person.firstName);
  if (n === first || n.split(" ")[0] === first) return 1;
  return 0;
}
