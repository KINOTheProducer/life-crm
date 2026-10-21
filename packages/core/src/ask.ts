// Picking search words out of a question for the "ask" retrieval step.

const stopWords = new Set(
  `a about above after again all also am an and any are as at be been before being both but by can could did do does doing
  done down during each ever few for from get got had has have having he her here hers him his how i if in into is it its
  just know last let like lives live living me more most my never no nor not now of off on once only or other our out over
  own same see seen she should so some still such tell than that the their them then there these they this those through
  to too under until up very was we well were what when where which while who whom whose why will with would you your
  yours anyone anybody someone somebody people person know knows saw talk talked spoke spoken name names called call`.split(/\s+/),
);

/** Everyday words for family, mapped to the terms the family tree uses. */
export const kinWords: Record<string, string> = {
  mom: "mother",
  mum: "mother",
  mother: "mother",
  dad: "father",
  father: "father",
  grandpa: "grandfather",
  granddad: "grandfather",
  grandfather: "grandfather",
  grandma: "grandmother",
  granny: "grandmother",
  nana: "grandmother",
  grandmother: "grandmother",
  sister: "sister",
  brother: "brother",
  aunt: "aunt",
  auntie: "aunt",
  uncle: "uncle",
  cousin: "cousin",
  niece: "niece",
  nephew: "nephew",
  son: "son",
  daughter: "daughter",
  wife: "wife",
  husband: "husband",
  partner: "partner",
};

/**
 * Lowercase words worth searching for: no stop words, no possessive "'s", at least three letters.
 * "What's Ryan's wife's name?" gives ["ryan", "wife"].
 */
export function questionKeywords(question: string): string[] {
  const words = question
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !stopWords.has(w));
  return [...new Set(words)];
}

/** A crude stem so "climbing" finds "climbs" and "climber": long words lose their ending. */
export function stem(word: string): string {
  return word.length >= 6 ? word.slice(0, 5) : word;
}
