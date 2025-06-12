import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parse, stringify } from '@std/csv';

async function openCSV<RowType>(
  path: string,
  headers: readonly string[],
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
  vaultPath: '/Users/mmcmanus/notes/040-Sources/Books/', // Replace with your vault path
  goodreadsCsvPath: 'goodreads_library_export.csv', // Replace with your CSV path
};

const GOODREADS_HEADERS = [
  'Book Id',
  'Title',
  'Author',
  'Author l-f',
  'Additional Authors',
  'ISBN',
  'ISBN13',
  'My Rating',
  'Average Rating',
  'Publisher',
  'Binding',
  'Number of Pages',
  'Year Published',
  'Original Publication Year',
  'Date Read',
  'Date Added',
  'Bookshelves',
  'Bookshelves with positions',
  'Exclusive Shelf',
  'My Review',
  'Spoiler',
  'Private Notes',
  'Read Count',
  'Owned Copies'
] as const;

type GoodreadExportHeaders = (typeof GOODREADS_HEADERS)[number];

interface GoodreadsBook extends Record<GoodreadExportHeaders, unknown>  {
  'Book Id': string;
  Title: string;
  Author: string;
  'Author l-f': string;
  'Additional Authors': string;
  ISBN: string;
  ISBN13: string;
  'My Rating': string;
  'Average Rating': string;
  Publisher: string;
  Binding: string;
  'Number of Pages': string;
  'Year Published': string;
  'Original Publication Year': string;
  'Date Read': string;
  'Date Added': string;
  Bookshelves: string;
  'Bookshelves with positions': string;
  'Exclusive Shelf': string;
  'My Review': string;
  Spoiler: string;
  'Private Notes': string;
  'Read Count': string;
  'Owned Copies': string;
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
    seriesNumber: seriesNumber?.trim()
  };
}

function findBookFile(title: string, vaultPath: string): boolean {
  const parsedTitle = parseTitle(title);
  const files = readdirSync(vaultPath);
  
  return files.some(file => {
    if (!file.endsWith('.md')) return false;
    return file.includes(parsedTitle.title);
  });
}

async function main() {
  try {
    const records = await openCSV<GoodreadsBook>(config.goodreadsCsvPath, GOODREADS_HEADERS)

    // Process each book
    for (const book of records.rows) {
      console.log("BOOK:", book.Title);
      console.log(` -> Shelf: ${book['Exclusive Shelf']}`);
      console.log(parseTitle(book.Title))
      const found = findBookFile(book.Title, config.vaultPath);
      console.log(` -> ${found ? 'FOUND' : 'NOT FOUND'}`);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main(); 