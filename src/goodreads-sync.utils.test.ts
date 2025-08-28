import { expect, test, describe } from "bun:test";
import { parseTitle } from "./goodreads-sync.utils";

describe("parseTitle", () => {
  test("parses full title with all components", () => {
    const result = parseTitle("The Great Gatsby: A Novel (Classics, #1)");
    expect(result).toEqual({
      title: "The Great Gatsby",
      subtitle: "A Novel",
      seriesName: "Classics",
      seriesNumber: "1",
      fullTitle: "The Great Gatsby: A Novel (Classics, #1)" 
    });
  });

  test("parses title without subtitle", () => {
    const result = parseTitle("The Great Gatsby (Classics, #1)");
    expect(result).toEqual({
      title: "The Great Gatsby",
      subtitle: undefined,
      fullTitle: "The Great Gatsby (Classics, #1)",
      seriesName: "Classics",
      seriesNumber: "1"
    });

    expect(parseTitle("Dawnshard (The Stormlight Archive, #3.5)")).toEqual({
      title: "Dawnshard",
      subtitle: undefined,
      fullTitle: "Dawnshard (The Stormlight Archive, #3.5)",
      seriesName: "The Stormlight Archive",
      seriesNumber: "3.5"
    });

    expect(parseTitle("A Feast for Crows (A Song of Ice and Fire #4)")).toEqual({
      title: "A Feast for Crows",
      subtitle: undefined,
      fullTitle: "A Feast for Crows (A Song of Ice and Fire #4)",
      seriesName: "A Song of Ice and Fire",
      seriesNumber: "4"
    });

    expect(parseTitle("The Lion, the Witch and the Wardrobe (The Chronicles of Narnia, #2)")).toEqual({
      title: "The Lion, the Witch and the Wardrobe",
      subtitle: undefined,
      fullTitle: "The Lion, the Witch and the Wardrobe (The Chronicles of Narnia, #2)",
      seriesName: "The Chronicles of Narnia",
      seriesNumber: "2"
    });
  });

  test("parses title without series", () => {
    const result = parseTitle("The Great Gatsby: A Novel");
    expect(result).toEqual({
      title: "The Great Gatsby",
      fullTitle: "The Great Gatsby: A Novel" ,
      subtitle: "A Novel"
    });
  });

  test("parses simple title", () => {
    const result = parseTitle("The Great Gatsby");
    expect(result).toEqual({
      title: "The Great Gatsby",
      fullTitle: "The Great Gatsby"
    });
  });
});
