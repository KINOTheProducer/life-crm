/** Words that say nothing about what the gift actually is. */
const filler = new Set(["a", "an", "the", "of", "for", "and", "with", "to", "new", "some", "set", "pair", "nice", "gift", "card", "one", "two", "three"]);

function words(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      // Plural and singular count as the same thing: "candles" is "candle".
      .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
      .filter((w) => w.length > 1 && !filler.has(w)),
  );
}

/**
 * The earlier gift that looks like the same idea, if any. Two titles match when they share
 * most of their meaningful words ("Chemex" and "Chemex coffee maker", "candles" and "a candle").
 */
export function similarGift<T extends { title: string }>(title: string, earlier: T[]): T | null {
  const a = words(title);
  if (a.size === 0) return null;
  let best: { gift: T; score: number } | null = null;
  for (const gift of earlier) {
    const b = words(gift.title);
    if (b.size === 0) continue;
    const shared = [...a].filter((w) => b.has(w)).length;
    const score = shared / Math.min(a.size, b.size);
    if (score >= 0.6 && (!best || score > best.score)) best = { gift, score };
  }
  return best?.gift ?? null;
}

/** Cents from what someone typed: "40", "$40.5", "1,299.99". Null when blank, NaN when it isn't money. */
export function parseMoney(input: string): number | null {
  const s = input.trim().replace(/^\$|\s|,/g, "");
  if (s === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return Number.NaN;
  return Math.round(Number(s) * 100);
}

export function formatMoney(cents: number, currency = "CAD"): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** Net balance from your side: positive when they owe you overall. */
export function debtBalance(debts: { direction: "they_owe" | "i_owe"; amountCents: number }[]): number {
  return debts.reduce((sum, d) => sum + (d.direction === "they_owe" ? d.amountCents : -d.amountCents), 0);
}
