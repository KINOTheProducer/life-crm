import { describe, expect, it } from "vitest";
import { addressKey, householdLabel } from "./households";

describe("householdLabel", () => {
  it("names couples", () => {
    expect(householdLabel([{ firstName: "Ryan", lastName: "Park" }, { firstName: "Mia", lastName: "Park" }])).toBe("Ryan & Mia Park");
    expect(householdLabel([{ firstName: "Ryan", lastName: "Park" }, { firstName: "Mia", lastName: "Chen" }])).toBe("Ryan Park & Mia Chen");
    expect(householdLabel([{ firstName: "Ryan", lastName: "Park" }, { firstName: "Mia", lastName: null }])).toBe("Ryan & Mia Park");
  });

  it("leaves kids out of a couple's name", () => {
    expect(
      householdLabel([
        { firstName: "Ryan", lastName: "Park" },
        { firstName: "Mia", lastName: "Park" },
        { firstName: "Leo", lastName: "Park", isChild: true },
      ]),
    ).toBe("Ryan & Mia Park");
  });

  it("calls bigger households a family when they share a name", () => {
    expect(householdLabel(["Ana", "Ben", "Cal"].map((firstName) => ({ firstName, lastName: "Silva" })))).toBe("The Silva family");
    expect(householdLabel([{ firstName: "Sam", lastName: "Ito" }, { firstName: "Jo", lastName: "Ito", isChild: true }])).toBe("The Ito family");
    expect(householdLabel([{ firstName: "Ana", lastName: "Silva" }, { firstName: "Ben", lastName: "Ruiz" }, { firstName: "Cal", lastName: null }])).toBe("Ana Silva, Ben Ruiz & Cal");
  });

  it("handles one person", () => {
    expect(householdLabel([{ firstName: "Priya", lastName: "Shah" }])).toBe("Priya Shah");
    expect(householdLabel([])).toBe("");
  });
});

describe("addressKey", () => {
  it("matches the same street written differently", () => {
    expect(addressKey({ street: "12 Elm Street", city: "Toronto" })).toBe(addressKey({ street: "12 elm st.", city: "toronto " }));
    expect(addressKey({ street: "12 Elm St", city: "Toronto" })).not.toBe(addressKey({ street: "14 Elm St", city: "Toronto" }));
    expect(addressKey({ street: null, city: "Toronto" })).toBeNull();
  });
});
