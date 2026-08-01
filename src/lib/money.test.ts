import { describe, it, expect } from 'vitest';
import { parseAmountToCents, centsToDollars } from './money';

describe('money', () => {
	it('parses thousands-separated amounts to cents', () => {
		expect(parseAmountToCents('1,234.56')).toBe(123456);
	});
	it('parses negative amounts to negative cents', () => {
		expect(parseAmountToCents('-50.00')).toBe(-5000);
	});
	it('parses a dollar-prefixed amount', () => {
		expect(parseAmountToCents('$45.5')).toBe(4550);
	});
	it('rejects garbage', () => {
		expect(() => parseAmountToCents('abc')).toThrow();
	});
	it('formats cents to dollars', () => {
		expect(centsToDollars(123456)).toBe('$1,234.56');
		expect(centsToDollars(-5000)).toBe('-$50.00');
	});
});
