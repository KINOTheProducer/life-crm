import { describe, expect, it } from "vitest";
import { debtBalance, formatMoney, parseMoney, similarGift } from "./gifts";

describe("similarGift", () => {
  const given = [
    { title: "Chemex coffee maker", year: 2024 },
    { title: "Scented candles", year: 2023 },
    { title: "Raptors tickets", year: 2025 },
  ];

  it("matches the same idea worded differently", () => {
    expect(similarGift("Chemex", given)?.year).toBe(2024);
    expect(similarGift("a candle", given)?.year).toBe(2023);
    expect(similarGift("Tickets to the Raptors", given)?.year).toBe(2025);
  });

  it("ignores accents and case", () => {
    expect(similarGift("CHÉMEX", given)?.year).toBe(2024);
  });

  it("doesn't match on filler words alone", () => {
    expect(similarGift("A new gift card", given)).toBeNull();
    expect(similarGift("Leafs tickets for two", [{ title: "Concert tickets for two" }])).toBeNull();
  });

  it("returns null for unrelated gifts", () => {
    expect(similarGift("Wool scarf", given)).toBeNull();
  });
});

describe("parseMoney", () => {
  it("reads dollars into cents", () => {
    expect(parseMoney("40")).toBe(4000);
    expect(parseMoney("$40.5")).toBe(4050);
    expect(parseMoney(" 1,299.99 ")).toBe(129999);
  });

  it("is null when blank and NaN for anything else", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("forty")).toBeNaN();
    expect(parseMoney("1.234")).toBeNaN();
    expect(parseMoney("-5")).toBeNaN();
  });
});

describe("formatMoney", () => {
  it("drops cents on round amounts", () => {
    expect(formatMoney(4000)).toBe("$40");
    expect(formatMoney(4050)).toBe("$40.50");
  });
});

describe("debtBalance", () => {
  it("nets what they owe against what you owe", () => {
    expect(
      debtBalance([
        { direction: "they_owe", amountCents: 5000 },
        { direction: "i_owe", amountCents: 2000 },
      ]),
    ).toBe(3000);
  });
});
