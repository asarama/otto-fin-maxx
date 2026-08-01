import { parse } from 'csv-parse/sync';
import { parseAmountToCents } from '../money';
import { normalizeDate } from '../date';
import type { ParseResult, ParsedRow } from './types';

export function parseCapitalOne(csvText: string): ParseResult {
	const records = parse<Record<string, string>>(csvText, { columns: true, skip_empty_lines: true });
	const rows: ParsedRow[] = [];
	const errors: string[] = [];
	records.forEach((rec, i) => {
		try {
			const description = String(rec.Description ?? '').trim();
			const debit = String(rec.Debit ?? '').trim();
			const credit = String(rec.Credit ?? '').trim();
			const amountCents = debit ? -parseAmountToCents(debit) : parseAmountToCents(credit);
			rows.push({
				postedDate: normalizeDate(String(rec['Posted Date'] ?? rec['Transaction Date'])),
				description,
				rawVendorName: description,
				amountCents,
			});
		} catch (err) {
			errors.push(`Row ${i + 2}: ${(err as Error).message}`);
		}
	});
	return { rows, errors };
}
