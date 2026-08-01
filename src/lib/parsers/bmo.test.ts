import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { parseBmo } from './bmo';

const fixture = readFileSync(fileURLToPath(new URL('./fixtures/bmo-sample.csv', import.meta.url)), 'utf8');

describe('parseBmo', () => {
  it('parses MM/DD/YYYY dates and debit/credit signs', () => {
    const { rows, errors } = parseBmo(fixture);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      postedDate: '2026-07-01',
      description: 'WALMART #1234',
      rawVendorName: 'WALMART #1234',
      amountCents: -5420
    });
    expect(rows[1].amountCents).toBe(200000);
    expect(rows[2].amountCents).toBe(-3890);
  });
});
