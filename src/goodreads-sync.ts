import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { parse, stringify } from "@std/csv";
import remarkFrontmatter from 'remark-frontmatter'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import remarkGfm from 'remark-gfm'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import yaml from 'js-yaml'
import type { Node, Parent } from 'unist'
import type { Heading, Text, Paragraph } from 'mdast'
import { mergeWith } from 'es-toolkit'

// Parse command line arguments
const args = process.argv.slice(2);
// const debug = args.includes("--debug");
const debug = true;
const limitIndex = args.findIndex(arg => arg === "--limit");
// const limit: number | null = limitIndex !== -1 ? parseInt(args[limitIndex + 1], 10) : null;
const limit = 3;

if (limitIndex !== -1 && (limit && (isNaN(limit) || limit < 1))) {
  console.error("Error: --limit must be followed by a positive number");
  process.exit(1);
}

async function openCSV<RowType>(
  path: string,
  headers: readonly string[]
): Promise<{ rows: RowType[]; headers: (keyof RowType)[] }> {
  const content = await Bun.file(path).text();
  const rows = parse(content.trim(), {
    skipFirstRow: true,
    columns: headers,
  }) as RowType[];
  return { rows, headers: headers as (keyof RowType)[] };
}

// Configuration
const config = {
  vaultPath: "/Users/matt/Notes//040-Sources/Books/", // Replace with your vault path
  goodreadsCsvPath: "goodreads_library_export.csv", // Replace with your CSV path
  template: "/Users/matt/Notes/999-Assets/templates/book-template.md",
};

const GOODREADS_HEADERS = [
  "Book Id",
  "Title",
  "Author",
  "Author l-f",
  "Additional Authors",
  "ISBN",
  "ISBN13",
  "My Rating",
  "Average Rating",
  "Publisher",
  "Binding",
  "Number of Pages",
  "Year Published",
  "Original Publication Year",
  "Date Read",
  "Date Added",
  "Bookshelves",
  "Bookshelves with positions",
  "Exclusive Shelf",
  "My Review",
  "Spoiler",
  "Private Notes",
  "Read Count",
  "Owned Copies",
] as const;

type GoodreadExportHeaders = (typeof GOODREADS_HEADERS)[number];

interface GoodreadsBook extends Record<GoodreadExportHeaders, unknown> {
  "Book Id": string;
  Title: string;
  Author: string;
  "Author l-f": string;
  "Additional Authors": string;
  ISBN: string;
  ISBN13: string;
  "My Rating": string;
  "Average Rating": string;
  Publisher: string;
  Binding: string;
  "Number of Pages": string;
  "Year Published": string;
  "Original Publication Year": string;
  "Date Read": string;
  "Date Added": string;
  Bookshelves: string;
  "Bookshelves with positions": string;
  "Exclusive Shelf": string;
  "My Review": string;
  Spoiler: string;
  "Private Notes": string;
  "Read Count": string;
  "Owned Copies": string;
}

interface ParsedTitle {
  title: string;
  subtitle?: string;
  seriesName?: string;
  seriesNumber?: string;
}

function parseTitle(fullTitle: string): ParsedTitle {
  // Match pattern: "Title: Subtitle (Series Name, #N)" or "Title: Subtitle (Series #N)"
  const regex = /^(.*?)(?::\s*(.*?))?\s*(?:\(([^,]+)(?:,\s*#?(\d+))?\))?$/;
  const match = fullTitle.match(regex);

  if (!match) {
    return { title: fullTitle.trim() };
  }

  const [, title, subtitle, seriesName, seriesNumber] = match;

  return {
    title: title.trim(),
    subtitle: subtitle?.trim(),
    seriesName: seriesName?.trim(),
    seriesNumber: seriesNumber?.trim(),
  };
}

function findBookFilePath(
  title: string,
  vaultPath: string
): string | undefined {
  const parsedTitle = parseTitle(title);
  const files = readdirSync(vaultPath);

  return files.find((file) => {
    if (!file.endsWith(".md")) return false;
    return file.includes(parsedTitle.title);
  });
}

function getBookTemplate(title: string): string {
  const parsedTitle = parseTitle(title);
  const limitedTitle = parsedTitle.subtitle
    ? `${parsedTitle.title}: ${parsedTitle.subtitle}`
    : parsedTitle.title;
  try {
    return readFileSync(config.template, "utf-8").replace(
      "{{title}}",
      limitedTitle
    );
  } catch (error) {
    console.error("Error loading book template:", error);
    process.exit(1);
  }
}

function createFrontmatterPlugin(book: GoodreadsBook) {
  return () => (tree: Parent) => {
    // Find and update the frontmatter node
    visit(tree, 'yaml', (node: any) => {
      // Prepare the new frontmatter data
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
        author: book.Author,
        shelf: book["Exclusive Shelf"],
        rating: book["My Rating"],
        length: book["Number of Pages"],
        year: book["Original Publication Year"],
        "read-last": book["Date Read"],
        "read-count": book["Read Count"],
        topics: []
      };

      // Add additional authors if present
      if (book["Additional Authors"]) {
        frontmatter.author += `, ${book["Additional Authors"]}`;
      }

      try {
        // Parse existing frontmatter if it exists
        const existingData = yaml.load(node.value) || {};
        // Deep merge with existing frontmatter, preferring existing values unless they're empty
        const mergedData = mergeWith(existingData, frontmatter, (targetValue, sourceValue) => {
          if (sourceValue === null || sourceValue === undefined || sourceValue === '' || 
              (Array.isArray(sourceValue) && sourceValue.length === 0)) {
            return targetValue;
          }
        });
        // Convert back to YAML
        node.value = yaml.dump(mergedData);
      } catch (err) {
        console.error(err);
        // If parsing fails, just use the new frontmatter
        node.value = yaml.dump(frontmatter);
      }
    });
  };
}

function createReviewPlugin(book: GoodreadsBook) {
  return () => (tree: Parent) => {
    // Add review section if review exists
    if (book["My Review"]?.trim()) {
      let foundH1 = false;
      let insertAfter: Heading | null = null;

      // Find the first h1 heading
      visit(tree, 'heading', (node: Heading) => {
        if (!foundH1 && node.depth === 1) {
          foundH1 = true;
          insertAfter = node;
        }
      });

      if (insertAfter) {
        // Create the review section nodes
        const reviewNodes: Node[] = [
          {
            type: 'heading',
            depth: 2,
            children: [{ type: 'text', value: 'Review' } as Text]
          } as Heading,
          {
            type: 'paragraph',
            children: [{ type: 'text', value: book["My Review"].trim() } as Text]
          } as Paragraph
        ];

        // Insert the review section after the h1
        const index = tree.children.indexOf(insertAfter);
        tree.children.splice(index + 1, 0, ...reviewNodes);
      }
    }
  };
}

async function processMarkdown(content: string, book: GoodreadsBook): Promise<string> {
  // Create a processor that can parse and stringify markdown
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(createFrontmatterPlugin(book))
    .use(createReviewPlugin(book))
    .use(remarkStringify);

  // Process the content
  const result = await processor.process(content);
  return result.toString();
}

async function main() {
  try {
    const records = await openCSV<GoodreadsBook>(
      config.goodreadsCsvPath,
      GOODREADS_HEADERS
    );

    // Process each book
    for (const [index, book] of records.rows.entries()) {
      // Check limit if set
      if (limit !== null && index >= limit) {
        console.log(`Reached limit of ${limit} books`);
        break;
      }

      console.log("BOOK:", book.Title);
      const title = parseTitle(book.Title);
      let bookPath = findBookFilePath(book.Title, config.vaultPath);
      let rawContent;

      if (bookPath) {
        rawContent = readFileSync(bookPath, "utf-8");
      } else {
        bookPath = `${config.vaultPath}/${title.title}.md`;
        rawContent = getBookTemplate(book.Title);
      }

      if (debug) {
        console.log("\n=== Raw Content ===");
        console.log(rawContent);
      }

      const finalContent = await processMarkdown(rawContent, book);

      if (debug) {
        console.log("\n=== Updated Content ===");
        console.log(finalContent);
        console.log("\n=== File Path ===");
        console.log(bookPath);
        console.log("\n" + "=".repeat(50) + "\n");
      } else {
        writeFileSync(bookPath, finalContent);
        console.log(`Updated: ${bookPath}`);
      }
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
