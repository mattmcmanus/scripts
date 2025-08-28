import { parse } from "@std/csv";
import * as Bun from "bun";

export async function openCSV<RowType>(
  path: string,
  headers: readonly string[]): Promise<{ rows: RowType[]; headers: (keyof RowType)[]; }> {
  const content = await Bun.file(path).text();
  const rows = parse(content.trim(), {
    skipFirstRow: true,
    columns: headers,
  }) as RowType[];
  return { rows, headers: headers as (keyof RowType)[] };
}
