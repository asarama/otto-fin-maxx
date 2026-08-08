import { describe, it, expect } from 'vitest';
import { parseAmountToCents, centsToDollars, dollarsToCents, centsToDollarString } from './money';

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

describe('dollarsToCents', () => {
	it('converts a dollar string to integer cents', () => {
		expect(dollarsToCents('15.00')).toBe(1500);
		expect(dollarsToCents('6.25')).toBe(625);
	});
	it('treats an empty string as no value', () => {
		expect(dollarsToCents('')).toBeNull();
		expect(dollarsToCents('   ')).toBeNull();
	});
	it('rounds half away from zero in both directions', () => {
		expect(dollarsToCents('0.005')).toBe(1);
		expect(dollarsToCents('-0.005')).toBe(-1);
	});
	it('strips currency formatting', () => {
		expect(dollarsToCents('$1,234.56')).toBe(123456);
	});
	it('rejects garbage', () => {
		expect(() => dollarsToCents('abc')).toThrow();
	});
});

describe('centsToDollarString', () => {
	it('renders a bare number-input value', () => {
		expect(centsToDollarString(123456)).toBe('1234.56');
		expect(centsToDollarString(0)).toBe('0.00');
		expect(centsToDollarString(-5000)).toBe('-50.00');
	});
	it('round-trips through dollarsToCents', () => {
		for (const cents of [0, 1, 625, 123456, -5000]) {
			expect(dollarsToCents(centsToDollarString(cents))).toBe(cents);
		}
	});
});
