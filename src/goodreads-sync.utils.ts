import { mergeWith } from "es-toolkit";
import type { GoodreadsBook } from "./goodreads-sync.types";

interface ParsedTitle {
  title: string;
  fullTitle: string;
  subtitle?: string;
  seriesName?: string;
  seriesNumber?: string;
}

export function parseTitle(fullTitle: string): ParsedTitle {
  // Match pattern: "Title: Subtitle (Series Name, #N)" or "Title: Subtitle (Series #N)"
  const regex = /^(.*?)(?::\s*(.*?))?\s*(?:\(([^#]+?)(?:[,\s]*#?(\d+(?:\.\d+)?))?\))?$/;
  const match = fullTitle.match(regex);

  const [, title, subtitle, seriesName, seriesNumber] = match ?? [];

  return {
    title: title.trim(),
    fullTitle,
    subtitle: subtitle?.trim(),
    seriesName: seriesName?.trim(),
    seriesNumber: seriesNumber?.trim(),
  };
}

export function updateFrontmatter(book: GoodreadsBook, existingData: {}) {
  const parsedTitle = parseTitle(book.Title);
  const frontmatter = {
    aliases: [],
    tags: ["books"],
    categories: ["[[Books]]"],
    url: `https://www.goodreads.com/book/show/${book["Book Id"]}`,
    title: parsedTitle.title,
    subtitle: parsedTitle.subtitle,
    "series-name": parsedTitle.seriesName,
    "series-number": parsedTitle.seriesNumber,
    author: [`[[${book.Author}]]`],
    shelf: book["Exclusive Shelf"],
    rating: parseInt(book["My Rating"]),
    length: parseInt(book["Number of Pages"]),
    year: parseInt(book["Original Publication Year"]),
    "read-last": book["Date Read"]
      ? book["Date Read"].replace(/\//g, "-")
      : '',
    "read-count": parseInt(book["Read Count"] || "0"),
    topics: [],
  };

  // Add additional authors if present
  if (book["Additional Authors"]) {
    frontmatter.author.push(`[[${book["Additional Authors"]}]]`);
  }
  // Deep merge with existing frontmatter, preferring existing values unless they're empty
  const mergedData = mergeWith(
    frontmatter,
    existingData,
    (targetValue, sourceValue, key) => {
      if (key === 'shelf') {
        return targetValue;
      }
      if (key === "tags" &&
        typeof sourceValue === "string" &&
        Array.isArray(targetValue)) {
        return [...new Set([...sourceValue.split(" "), ...targetValue])];
      }

      if (key === "rating") {
        return parseInt(targetValue);
      }

      if (sourceValue === null ||
        sourceValue === undefined ||
        sourceValue === "" ||
        (Array.isArray(sourceValue) && sourceValue.length === 0)) {
        return targetValue;
      }
    }
  );
  return mergedData;
}