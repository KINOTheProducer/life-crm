import { describe, expect, it } from "vitest";
import { questionKeywords, stem } from "./ask";

describe("questionKeywords", () => {
  it("drops stop words and possessives", () => {
    expect(questionKeywords("What's Ryan's wife's name?")).toEqual(["ryan", "wife"]);
    expect(questionKeywords("Who do I know that's into climbing and lives in Toronto?")).toEqual(["climbing", "toronto"]);
    expect(questionKeywords("When did I last see Grandpa?")).toEqual(["grandpa"]);
  });

  it("keeps accented names", () => {
    expect(questionKeywords("Where does Zoë work?")).toEqual(["zoë", "work"]);
  });
});

describe("stem", () => {
  it("trims long words only", () => {
    expect(stem("climbing")).toBe("climb");
    expect(stem("ryan")).toBe("ryan");
  });
});
