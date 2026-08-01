import { parse } from 'csv-parse/sync';
import { parseAmountToCents } from '../money';
import { normalizeDate } from '../date';
import type { ParseResult, ParsedRow } from './types';

export function parseBmo(csvText: string): ParseResult {
  const records = parse<Record<string, string>>(csvText, { columns: true, skip_empty_lines: true });
  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  records.forEach((rec, i) => {
    try {
      const description = String(rec.Description ?? '').trim();
      const type = String(rec.Type ?? '').trim().toLowerCase();
      const amount = parseAmountToCents(String(rec.Amount ?? ''));
      let amountCents: number;
      if (type === 'credit' || type === 'deposit') amountCents = Math.abs(amount);
      else if (type === 'debit' || type === 'withdrawal') amountCents = -Math.abs(amount);
      else amountCents = amount;
      rows.push({
        postedDate: normalizeDate(String(rec.Date ?? '')),
        description,
        rawVendorName: description,
        amountCents
      });
    } catch (err) {
      errors.push(`Row ${i + 2}: ${(err as Error).message}`);
    }
  });
  return { rows, errors };
}
