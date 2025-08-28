import { readFileSync, readdirSync, writeFileSync } from "fs";
import remarkFrontmatter from "remark-frontmatter";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkWikiLink from "remark-wiki-link";
import remarkHtml from "remark-html";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import yaml from "js-yaml";
import type { Node, Parent } from "unist";
import type { Heading, Text, Paragraph, Root } from "mdast";
import { parseArgs } from "node:util";
import { parseTitle, updateFrontmatter } from "./goodreads-sync.utils";
import type { GoodreadsBook } from "./goodreads-sync.types";
import { GOODREADS_HEADERS } from "./goodreads-sync.types";
import { openCSV } from "./utils/csv";
import { fromHtml } from "hast-util-from-html";
import { toMdast } from "hast-util-to-mdast";

// Parse command line arguments
const {
  values: { debug, limit, shelf },
} = parseArgs({
  options: {
    debug: {
      type: "boolean",
      short: "d",
      // default: true,
    },
    limit: {
      type: "string",
      short: "l",
      // default: '3'
    },
    shelf: {
      type: "string",
      short: "s",
      // default: 'read'
    },
  },
});

// Convert limit to number if provided
const parsedLimit = limit ? parseInt(limit, 10) : null;

if (parsedLimit && (isNaN(parsedLimit) || parsedLimit < 1)) {
  console.error("Error: --limit must be a positive number");
  process.exit(1);
}

// Configuration
const config = {
  vaultPath: "/Users/matt/Notes/040-Sources/Books/", // Replace with your vault path
  goodreadsCsvPath: "goodreads_library_export.csv", // Replace with your CSV path
  template: "/Users/matt/Notes/999-Assets/templates/book-template.md",
};

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
  try {
    return readFileSync(config.template, "utf-8").replace("{{title}}", title);
  } catch (error) {
    console.error("Error loading book template:", error);
    process.exit(1);
  }
}

function createFrontmatterPlugin(book: GoodreadsBook) {
  return () => (tree: Parent) => {
    // Find and update the frontmatter node
    visit(tree, "yaml", (node: any) => {
      try {
        // Parse existing frontmatter if it exists
        const existingData = structuredClone(yaml.load(node.value) || {});
        // Prepare the new frontmatter data
        const mergedData = updateFrontmatter(book, existingData);
        // Convert back to YAML
        const dump = yaml.dump(mergedData, {
          quotingType: '\"',
          sortKeys: true,
          styles: {
            '!!null': 'empty'
          },
        });
        node.value = dump;
      } catch (err) {
        console.error(err);
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
      let hasReviewSection = false;

      // Check for existing review section and find first h1
      visit(tree, "heading", (node: Heading) => {
        if (node.depth === 2 && node.children[0]?.type === 'text' && 
            node.children[0].value.toLowerCase().includes('review')) {
          hasReviewSection = true;
        }
        if (!foundH1 && node.depth === 1) {
          foundH1 = true;
          insertAfter = node;
        }
      });

      // Skip if review section already exists
      if (hasReviewSection) {
        return;
      }

      if (insertAfter) {
        // Convert HTML to HAST then to MDAST
        const hast = fromHtml(book["My Review"].trim());
        const mdast = toMdast(hast) as Root;
        
        // Create the review section nodes
        const sectionNodes: Node[] = [
          {
            type: "heading",
            depth: 2,
            children: [{ type: "text", value: "My Review #reviewed" } as Text],
          } as Heading,
          ...mdast.children
        ];

        // Insert the review section after the h1
        const index = tree.children.indexOf(insertAfter);
        tree.children.splice(index + 1, 0, ...sectionNodes);
      }
    }
  };
}

function createCoverPlugin() {
  return () => (tree: Parent) => {
    let coverUrl: string | undefined;
    let nodesToRemove: Node[] = [];

    // Find the cover line and store its URL
    visit(tree, 'paragraph', (node: Paragraph, index: number, parent: Parent) => {
      const firstChild = node.children[0];
      if (firstChild?.type === 'text' && firstChild.value.startsWith('cover::')) {
        coverUrl = firstChild.value.replace('cover::', '').trim();
        nodesToRemove.push(node);
        // Also remove the next node if it's a blank line
        const nextNode = parent.children[index + 1];
        if (nextNode?.type === 'paragraph' && 
            'children' in nextNode && 
            (nextNode as Paragraph).children.length === 0) {
          nodesToRemove.push(nextNode);
        }
      }
    });

    // Remove the cover line and blank line
    tree.children = tree.children.filter(node => !nodesToRemove.includes(node));

    // Add cover to frontmatter if found
    if (coverUrl) {
      visit(tree, 'yaml', (node: any) => {
        try {
          const existingData = yaml.load(node.value) || {};
          node.value = yaml.dump({ ...existingData, cover: coverUrl });
        } catch (err) {
          console.error('Error updating frontmatter with cover:', err);
        }
      });
    }
  };
}

async function processMarkdown(
  content: string,
  book: GoodreadsBook
): Promise<string> {
  // Create a processor that can parse and stringify markdown
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkWikiLink)
    .use(createCoverPlugin())
    .use(createFrontmatterPlugin(book))
    .use(createReviewPlugin(book))
    .use(remarkStringify, { rule: '-', bullet: '-' });

  // Process the content
  const result = await processor.process(content);
  return result.toString();
}

async function main() {
  let count = 0;
  try {
    const records = await openCSV<GoodreadsBook>(
      config.goodreadsCsvPath,
      GOODREADS_HEADERS
    );

    // Process each book
    for (const [index, book] of records.rows.entries()) {
      // Filter by shelf if specified
      if (
        shelf &&
        book["Exclusive Shelf"].toLowerCase() !== shelf.toLowerCase()
      ) {
        continue;
      }
      count++;
      // Check limit if set
      if (parsedLimit !== null && count > parsedLimit) {
        console.log(`Reached limit of ${parsedLimit} books`);
        break;
      }

      console.log("BOOK:", book.Title);
      const title = parseTitle(book.Title);
      let bookPath = findBookFilePath(book.Title, config.vaultPath);
      let rawContent;

      if (bookPath) {
        bookPath = `${config.vaultPath}/${bookPath}`;
        rawContent = readFileSync(bookPath, "utf-8");
      } else {
        bookPath = `${config.vaultPath}${title.title}.md`;
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
