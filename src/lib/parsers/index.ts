import { parseCapitalOne } from './capitalOne';
import { parseBmo } from './bmo';
import type { ParseResult } from './types';

export type BankId = 'capital_one' | 'bmo';
export type { ParsedRow, ParseResult } from './types';

export function parseBankCsv(bank: BankId, csvText: string): ParseResult {
	if (bank === 'capital_one') return parseCapitalOne(csvText);
	if (bank === 'bmo') return parseBmo(csvText);
	throw new Error(`Unknown bank: ${bank}`);
}
