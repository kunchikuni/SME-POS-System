/**
 * Minimal RFC4180 CSV parse/stringify. No dependency added for this — the
 * format needed (quoted fields, embedded commas, "" as an escaped quote,
 * newlines inside quoted fields) is small enough to hand-write correctly,
 * and every route that touches CSV in this app (import, export, the
 * template download) shares these two functions so escaping stays
 * consistent everywhere.
 */

/** Parses CSV text into rows of string cells. Header row is NOT stripped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  // Normalize line endings up front so \r\n inside/outside quotes behaves identically.
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += c;
  }

  // Last field/row, if the file doesn't end with a trailing newline.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-blank trailing rows (common with a trailing newline in the file).
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** Quotes a single CSV field only when necessary (has a comma, quote, or newline). */
export function csvField(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Joins already-escaped fields into one CSV line (no trailing newline). */
export function csvRow(fields: unknown[]): string {
  return fields.map(csvField).join(',');
}
