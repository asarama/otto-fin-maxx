import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { parseCapitalOne } from './capitalOne';

const fixture = readFileSync(
	fileURLToPath(new URL('./fixtures/capitalOne-sample.csv', import.meta.url)),
	'utf8'
);

describe('parseCapitalOne', () => {
	it('parses debits as negative cents and credits as positive cents', () => {
		const { rows, errors } = parseCapitalOne(fixture);
		expect(errors).toEqual([]);
		expect(rows).toHaveLength(3);
		expect(rows[0]).toEqual({
			postedDate: '2026-07-02',
			description: 'AMZN MKTP US',
			rawVendorName: 'AMZN MKTP US',
			amountCents: -4567,
		});
		expect(rows[1].amountCents).toBe(-1234);
		expect(rows[2].amountCents).toBe(20000);
	});

	it('reports bad rows and keeps the valid ones', () => {
		const csv = [
			'Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit',
			'2026-07-01,2026-07-02,X1,GOOD ONE,Food,5.00,',
			'2026-07-03,2026-07-04,X1,BAD AMOUNT,Food,not-a-number,',
			'2026-07-05,2026-07-06,X1,GOOD TWO,Food,,7.00',
		].join('\n');
		const { rows, errors } = parseCapitalOne(csv);
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.description)).toEqual(['GOOD ONE', 'GOOD TWO']);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatch(/Row 3/);
	});
});
