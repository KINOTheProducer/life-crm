import { describe, expect, it } from "vitest";
import { nameMatch } from "./names";

const holly = { firstName: "Holly", lastName: "Chen", nickname: "Hols" };

describe("nameMatch", () => {
  it("scores full names and nicknames highest", () => {
    expect(nameMatch("Holly Chen", holly)).toBe(2);
    expect(nameMatch("  holly   chen ", holly)).toBe(2);
    expect(nameMatch("Hols", holly)).toBe(2);
  });

  it("scores a first name alone, or a different last name, lower", () => {
    expect(nameMatch("Holly", holly)).toBe(1);
    expect(nameMatch("Holly C.", holly)).toBe(1);
  });

  it("ignores accents and punctuation", () => {
    expect(nameMatch("Zoë O'Brien", { firstName: "Zoe", lastName: "OBrien" })).toBe(1);
    expect(nameMatch("José Núñez", { firstName: "Jose", lastName: "Nunez" })).toBe(2);
  });

  it("never matches empty or different names", () => {
    expect(nameMatch("", holly)).toBe(0);
    expect(nameMatch("Hollis", holly)).toBe(0);
  });
});
